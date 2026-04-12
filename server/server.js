const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const { Client, Intents } = require('discord.js-selfbot-v13');
const { Server } = require('socket.io');
const http = require('http');
const path = require('path');
const fs = require('fs');
const ffmpeg = require('@ffmpeg-installer/ffmpeg');
const { Streamer, streamLivestreamVideo } = require('@dank074/discord-video-stream');
const { createAudioPlayer, createAudioResource, joinVoiceChannel, VoiceConnectionStatus, AudioPlayerStatus } = require('@discordjs/voice');

// ====================== CONFIG & ENVIRONMENT ======================
const PORT = process.env.PORT || 3001;
const NODE_ENV = process.env.NODE_ENV || 'development';

const ALLOWED_ORIGINS = process.env.ALLOWED_ORIGINS 
  ? process.env.ALLOWED_ORIGINS.split(',').map(o => o.trim())
  : ['*']; // Vercel ve Render'da kolay kurulum için '*' (Helmet ile korunuyor)

const STATS_FILE = path.join(__dirname, 'data', 'staff_stats.json');

// FFmpeg Setup
process.env.FFMPEG_PATH = ffmpeg.path;

// ====================== INITIALIZATION ======================
const app = express();
const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin: ALLOWED_ORIGINS,
    methods: ["GET", "POST"],
    credentials: true
  },
  pingTimeout: 60000,
  pingInterval: 25000
});

// ====================== SECURITY MIDDLEWARES ======================
app.use(helmet({
  contentSecurityPolicy: NODE_ENV === 'production' ? true : false
}));

app.use(cors({
  origin: ALLOWED_ORIGINS,
  credentials: true
}));

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Rate Limiting
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 150,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Çok fazla istek gönderildi. Lütfen 15 dakika sonra tekrar deneyin.' }
});

app.use('/api/', apiLimiter);

// Health Check Endpoint
app.get('/health', (req, res) => {
  res.status(200).json({ 
    status: 'ok', 
    uptime: process.uptime(),
    environment: NODE_ENV,
    activeSessions: activeSessions.size 
  });
});

// ====================== STATIC PATHS ======================
const BANNER_PATH = path.join(__dirname, 'assets', 'stream_banner.png');
const CAFE_STATIC_PATH = path.join(__dirname, 'assets', 'cafe_static.png');

// ====================== IN-MEMORY STORAGE ======================
const activeSessions = new Map();
const staffStats = new Map();
const monitoredGuilds = new Map();
let staffLogs = [];

// ====================== UTILITY FUNCTIONS ======================
const ensureDataDir = () => {
  const dataDir = path.join(__dirname, 'data');
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }
};

const loadStats = () => {
  try {
    ensureDataDir();
    if (fs.existsSync(STATS_FILE)) {
      const data = JSON.parse(fs.readFileSync(STATS_FILE, 'utf8'));
      Object.entries(data).forEach(([id, stats]) => {
        staffStats.set(id, stats);
      });
      console.log(`[STATS] ${staffStats.size} personel istatistiği yüklendi.`);
    }
  } catch (e) {
    console.error('[STATS] Yükleme hatası:', e.message);
  }
};

const saveStats = () => {
  try {
    ensureDataDir();
    const data = Object.fromEntries(staffStats);
    fs.writeFileSync(STATS_FILE, JSON.stringify(data, null, 2));
  } catch (e) {
    console.error('[STATS] Kaydetme hatası:', e.message);
  }
};

setInterval(saveStats, 5 * 60 * 1000);
loadStats();

// ====================== SYNC FUNCTIONS ======================
let syncAccountsTimeout = null;
let syncStaffTimeout = null;

const syncSystemAccounts = () => {
  const sessions = Array.from(activeSessions.values()).map(session => ({
    id: session.client.user.id,
    username: session.client.user.username,
    displayName: session.client.user.displayName || session.client.user.username,
    avatar: session.client.user.displayAvatarURL({ format: 'png', size: 128 }),
    status: session.presence || 'online',
    isSeste: session.voiceConnection?.state?.status === VoiceConnectionStatus.Ready,
    connectedAt: session.connectedAt,
    config: session.config,
    token: session.token
  }));
  
  io.emit('sessionsUpdate', sessions);
};

const syncStaffPanel = () => {
  const stats = Array.from(staffStats.entries()).map(([id, stat]) => ({
    id,
    name: stat.name || 'Bilinmeyen',
    avatar: stat.avatar || '',
    onlineTime: stat.onlineTime || 0,
    messageCount: stat.messageCount || 0,
    voiceTime: stat.voiceTime || 0
  }));
  
  io.emit('staffStatsUpdate', stats);
  io.emit('staffLogsUpdate', staffLogs.slice(-50));
};

const throttledSyncAccounts = () => {
  if (syncAccountsTimeout) clearTimeout(syncAccountsTimeout);
  syncAccountsTimeout = setTimeout(() => {
    syncSystemAccounts();
    syncAccountsTimeout = null;
  }, 800);
};

const throttledSyncStaff = () => {
  if (syncStaffTimeout) clearTimeout(syncStaffTimeout);
  syncStaffTimeout = setTimeout(() => {
    syncStaffPanel();
    syncStaffTimeout = null;
  }, 800);
};

// ====================== CLEANUP SESSION ======================
const cleanupSession = (session) => {
  try {
    if (session.voiceConnection) {
      session.voiceConnection.destroy();
      session.voiceConnection = null;
    }
    
    if (session.audioPlayer) {
      session.audioPlayer.stop();
      session.audioPlayer = null;
    }
    
    if (session.streamer) {
      try { session.streamer.stopStream(); } catch (e) {}
      session.streamer = null;
    }
    
    if (session.client && session.client.isReady()) {
      session.client.destroy();
    }
    
    activeSessions.delete(session.client.user.id);
    console.log(`[CLEANUP] Oturum temizlendi: ${session.client.user.username}`);
  } catch (error) {
    console.error('[CLEANUP] Hata:', error.message);
  }
};

// ====================== GUILD MONITORING ======================
const setupGuildMonitoring = (client, serverId) => {
  if (monitoredGuilds.has(serverId)) return;
  
  monitoredGuilds.set(serverId, client.user.id);
  
  client.on('voiceStateUpdate', (oldState, newState) => {
    if (oldState.guild.id !== serverId) return;
    
    const member = newState.member;
    if (!member || member.user.bot) return;
    
    const userId = member.user.id;
    if (!staffStats.has(userId)) {
      staffStats.set(userId, {
        name: member.displayName || member.user.username,
        avatar: member.user.displayAvatarURL({ format: 'png', size: 128 }),
        onlineTime: 0,
        messageCount: 0,
        voiceTime: 0
      });
    }
    
    const joinedChannel = newState.channelId && !oldState.channelId;
    const leftChannel = !newState.channelId && oldState.channelId;
    
    if (joinedChannel) {
      addStaffLog(member.user, 'join', { channel: newState.channel.name });
    } else if (leftChannel) {
      addStaffLog(member.user, 'leave', { channel: oldState.channel.name });
    }
    
    throttledSyncStaff();
  });
  
  console.log(`[MONITOR] Guild ${serverId} izleme aktif`);
};

const addStaffLog = (user, type, details) => {
  staffLogs.push({
    timestamp: Date.now(),
    userId: user.id,
    username: user.username,
    type,
    details
  });
  
  if (staffLogs.length > 100) {
    staffLogs = staffLogs.slice(-100);
  }
};

// ====================== STREAMING FUNCTIONS ======================
const getStreamAsset = (session) => {
  if (session.config?.cafeMode) {
    return fs.existsSync(CAFE_STATIC_PATH) ? CAFE_STATIC_PATH : BANNER_PATH;
  }
  return BANNER_PATH;
};

const stopStream = (session) => {
  try {
    if (session.streamer) {
      session.streamer.stopStream();
      session.streamer = null;
      console.log(`[STREAM] Yayın durduruldu: ${session.client.user.username}`);
    }
  } catch (error) {
    console.error('[STREAM] Durdurma hatası:', error.message);
  }
};

const startStream = async (session, guildId, channelId) => {
  try {
    if (!session.voiceConnection || session.voiceConnection.state.status !== VoiceConnectionStatus.Ready) {
      throw new Error('Ses bağlantısı hazır değil');
    }
    
    const streamAsset = getStreamAsset(session);
    if (!fs.existsSync(streamAsset)) {
      throw new Error('Stream asset bulunamadı: ' + streamAsset);
    }
    
    const udp = session.voiceConnection.voiceUdp;
    if (!udp) {
      throw new Error('Voice UDP bulunamadı');
    }
    
    session.streamer = new Streamer(session.client);
    await streamLivestreamVideo(streamAsset, udp, {
      width: 1280,
      height: 720,
      fps: 30,
      bitrateKbps: 2500,
      maxBitrateKbps: 3000,
      hardwareAcceleratedDecoding: false,
      videoCodec: 'H264'
    });
    
    console.log(`[STREAM] Yayın başlatıldı: ${session.client.user.username}`);
    return true;
  } catch (error) {
    console.error('[STREAM] Başlatma hatası:', error.message);
    return false;
  }
};

// ====================== VOICE CONNECTION ======================
const connectToVoice = async (client, serverId, channelId, media) => {
  try {
    console.log(`[VOICE] Ses kanalına bağlanılıyor: ${channelId}`);
    
    const guild = await client.guilds.fetch(serverId).catch(e => {
      throw new Error(`Sunucu bulunamadı: ${serverId}. Botun bu sunucuda olduğundan emin ol!`);
    });
    
    const channel = await guild.channels.fetch(channelId).catch(e => {
      throw new Error(`Kanal bulunamadı: ${channelId}. Kanal ID'sini kontrol et!`);
    });
    
    if (!channel || !channel.isVoiceBased()) {
      throw new Error(`Bu bir ses kanalı değil: ${channel?.name || channelId}`);
    }
    
    console.log(`[VOICE] ${channel.name} kanalına bağlanılıyor...`);
    
    const connection = joinVoiceChannel({
      channelId: channel.id,
      guildId: guild.id,
      adapterCreator: guild.voiceAdapterCreator,
      selfDeaf: !media.sound,
      selfMute: !media.mic
    });
    
    // Wait for ready
    await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        connection.destroy();
        reject(new Error('Ses bağlantısı zaman aşımına uğradı (15 saniye). Eğer sistemi Render/Vercel backend üzerinden kullanıyorsanız, Discord voice trafiği platform tarafından engellenmiş olabilir veya bir Proxy kullanmanız gerekebilir.'));
      }, 15000);
      
      connection.on(VoiceConnectionStatus.Ready, () => {
        clearTimeout(timeout);
        console.log(`[VOICE] ✅ ${client.user.username} ses kanalına bağlandı`);
        resolve();
      });
      
      connection.on(VoiceConnectionStatus.Disconnected, async () => {
        try {
          await Promise.race([
            new Promise((resolve) => connection.once(VoiceConnectionStatus.Ready, resolve)),
            new Promise((resolve) => setTimeout(resolve, 5000))
          ]);
        } catch {
          clearTimeout(timeout);
          connection.destroy();
          reject(new Error('Ses bağlantısı koptu'));
        }
      });
    });
    
    return connection;
  } catch (error) {
    console.error('[VOICE] Bağlantı hatası:', error.message);
    throw error;
  }
};

// ====================== TOKEN CONNECTION ======================
const connectToken = async (data) => {
  const { token, serverId, voiceId, presence, media, proxy, activityText, streamType } = data;
  
  try {
    console.log('[CONNECT] Client oluşturuluyor...');
    
    const client = new Client({
      checkUpdate: false,
      patchVoice: true,
      autoRedeemNitro: false,
      intents: [Intents.FLAGS.GUILDS, Intents.FLAGS.GUILD_VOICE_STATES, Intents.FLAGS.GUILD_MESSAGES],
      ws: {
          properties: {
              $os: 'Windows',
              $browser: 'Discord Client',
              $device: 'Discord Client'
          }
      },
      ...(proxy && { 
        http: { 
          agent: new (require('https-proxy-agent').HttpsProxyAgent)(proxy)
        } 
      })
    });

    console.log(`[CONNECT] Token girişi deneniyor... (${token.substring(0, 10)}...)`);
    
    await client.login(token).catch(err => {
      console.error(`[LOGIN ERROR] ${token.substring(0, 10)}:`, err.message);
      throw new Error(`Hesaba giriş yapılamadı. Token yanlış olabilir veya hesap doğrulamaya (2FA/Email) düşmüş olabilir.`);
    });
    
    console.log(`[CONNECT] ✅ Giriş başarılı: ${client.user.username}#${client.user.discriminator}`);
    
    // Set presence after login
    if (activityText) {
      client.user.setPresence({
        status: presence || 'online',
        activities: [{ name: activityText, type: 0 }] // 0 = PLAYING
      });
    } else {
      client.user.setStatus(presence || 'online');
    }
    
    const voiceConnection = await connectToVoice(client, serverId, voiceId, media);
    
    const session = {
      client,
      voiceConnection,
      audioPlayer: null,
      streamer: null,
      token,
      presence: presence || 'online',
      connectedAt: Date.now(),
      config: {
        media,
        cafeMode: streamType === 'cafe',
        serverId,
        voiceId
      }
    };
    
    activeSessions.set(client.user.id, session);
    
    if (media.stream || streamType === 'cafe') {
      await new Promise(resolve => setTimeout(resolve, 2000));
      await startStream(session, serverId, voiceId);
    }
    
    setupGuildMonitoring(client, serverId);
    throttledSyncAccounts();
    
    return {
      success: true,
      userId: client.user.id,
      username: client.user.username
    };
    
  } catch (error) {
    console.error('[CONNECT] Bağlantı hatası:');
    console.error('  Error:', error.message);
    console.error('  Stack:', error.stack);
    throw error;
  }
};

// ====================== API ROUTES ======================
app.post('/api/connect', async (req, res) => {
  const { tokens, serverId: rawServerId, voiceId: rawVoiceId, presence, media, proxy, activityText, streamType } = req.body;
  const serverId = rawServerId?.trim();
  const voiceId = rawVoiceId?.trim();
  
  if (!tokens || !Array.isArray(tokens) || tokens.length === 0) {
    return res.status(400).json({ error: 'Token listesi gerekli' });
  }
  
  if (!serverId || !voiceId) {
    return res.status(400).json({ error: 'Sunucu ID ve Ses ID gerekli' });
  }
  
  const results = { success: [], failed: [] };
  
  for (let token of tokens) {
    token = token.trim();
    if (!token) continue;
    
    try {
      console.log(`[API] Bağlanılıyor... Token: ${token.substring(0, 15)}...`);
      
      const result = await connectToken({
        token,
        serverId,
        voiceId,
        presence,
        media,
        proxy,
        activityText,
        streamType
      });
      
      console.log(`[API] ✅ Başarılı: ${result.username}`);
      results.success.push(result.username);
    } catch (error) {
      console.error(`[API] ❌ Hata:`, error.message);
      results.failed.push({ 
        token: token.substring(0, 20) + '...', 
        error: error.message 
      });
    }
  }
  
  res.json({
    message: `${results.success.length} hesap bağlandı${results.failed.length > 0 ? `, ${results.failed.length} başarısız` : ''}`,
    success: results.success,
    failed: results.failed
  });
});

app.post('/api/update-media', async (req, res) => {
  const { tokens, media } = req.body;
  
  if (!tokens || !media) {
    return res.status(400).json({ error: 'Tokens ve media gerekli' });
  }
  
  let updated = 0;
  
  for (const [userId, session] of activeSessions) {
    if (tokens.includes(session.token)) {
      session.config.media = { ...session.config.media, ...media };
      
      if (session.voiceConnection) {
        session.voiceConnection.setSelfDeaf(!media.sound);
        session.voiceConnection.setSelfMute(!media.mic);
      }
      
      if (media.stream && !session.streamer) {
        await startStream(session, session.config.serverId, session.config.voiceId);
      } else if (!media.stream && session.streamer) {
        stopStream(session);
      }
      
      updated++;
    }
  }
  
  throttledSyncAccounts();
  res.json({ success: true, updated });
});

app.post('/api/logout', (req, res) => {
  const { userId } = req.body;
  
  const session = activeSessions.get(userId);
  if (session) {
    cleanupSession(session);
    throttledSyncAccounts();
    res.json({ success: true });
  } else {
    res.status(404).json({ error: 'Oturum bulunamadı' });
  }
});

app.post('/api/logout-all', (req, res) => {
  activeSessions.forEach(session => {
    try { cleanupSession(session); } catch (e) {}
  });
  
  activeSessions.clear();
  throttledSyncAccounts();
  
  res.json({ success: true, message: 'Tüm oturumlar kapatıldı' });
});

// ====================== SOCKET.IO ======================
io.on('connection', (socket) => {
  console.log(`[SOCKET] Yeni bağlantı: ${socket.id}`);
  
  syncSystemAccounts();
  syncStaffPanel();

  socket.on('disconnect', () => {
    console.log(`[SOCKET] Bağlantı koptu: ${socket.id}`);
  });
});

// ====================== GRACEFUL SHUTDOWN ======================
const gracefulShutdown = () => {
  console.log('[SHUTDOWN] Sunucu kapatılıyor...');
  saveStats();
  
  activeSessions.forEach(session => {
    try { cleanupSession(session); } catch (e) {}
  });
  
  server.close(() => {
    console.log('[SHUTDOWN] HTTP server kapatıldı');
    process.exit(0);
  });
};

process.on('SIGTERM', gracefulShutdown);
process.on('SIGINT', gracefulShutdown);

// ====================== START SERVER ======================
server.listen(PORT, () => {
  console.log(`🚀 Dave.903 Backend sunucusu ${PORT} portunda çalışıyor...`);
  console.log(`   Ortam: ${NODE_ENV}`);
  console.log(`   İzin verilen originler: ${ALLOWED_ORIGINS.join(', ')}`);
});
