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
const { joinVoiceChannel, VoiceConnectionStatus } = require('@discordjs/voice');

// ====================== CONFIG & ENVIRONMENT ======================
const PORT = process.env.PORT || 3001;
const NODE_ENV = process.env.NODE_ENV || 'development';

const ALLOWED_ORIGINS = process.env.ALLOWED_ORIGINS 
  ? process.env.ALLOWED_ORIGINS.split(',').map(o => o.trim())
  : ['*']; 

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
  }
});

// ====================== SECURITY MIDDLEWARES ======================
app.use(helmet({ contentSecurityPolicy: NODE_ENV === 'production' ? true : false }));
app.use(cors({ origin: ALLOWED_ORIGINS, credentials: true }));
app.use(express.json({ limit: '10mb' }));

const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 150,
  message: { error: 'Çok fazla istek gönderildi. Lütfen 15 dakika sonra tekrar deneyin.' }
});

app.use('/api/', apiLimiter);

// Health Check
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'ok', uptime: process.uptime(), activeSessions: activeSessions.size });
});

// Paths
const BANNER_PATH = path.join(__dirname, 'assets', 'stream_banner.png');
const CAFE_STATIC_PATH = path.join(__dirname, 'assets', 'cafe_static.png');

// In-Memory Storage
const activeSessions = new Map();
const staffStats = new Map();
const monitoredGuilds = new Map();
let staffLogs = [];

// ====================== UTILITIES ======================
const ensureDataDir = () => {
    const dataDir = path.join(__dirname, 'data');
    if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
};

const loadStats = () => {
    try {
        ensureDataDir();
        if (fs.existsSync(STATS_FILE)) {
            const data = JSON.parse(fs.readFileSync(STATS_FILE, 'utf8'));
            Object.entries(data).forEach(([id, stats]) => staffStats.set(id, stats));
        }
    } catch (e) { console.error('[STATS] Yükleme hatası:', e.message); }
};

const saveStats = () => {
    try {
        ensureDataDir();
        const data = Object.fromEntries(staffStats);
        fs.writeFileSync(STATS_FILE, JSON.stringify(data, null, 2));
    } catch (e) { console.error('[STATS] Kaydetme hatası:', e.message); }
};

setInterval(saveStats, 5 * 60 * 1000);
loadStats();

// ====================== SYNC FUNCTIONS ======================
const syncSystemAccounts = () => {
  const sessions = Array.from(activeSessions.values()).map(session => {
    const client = session.client;
    let activeVoice = null;
    client.guilds.cache.forEach(guild => {
       const vs = guild.members.me?.voice;
       if (vs && vs.channelId) activeVoice = vs;
    });

    return {
        id: client.user.id,
        username: client.user.username,
        displayName: client.user.tag,
        avatar: client.user.displayAvatarURL({ format: 'png', size: 128 }),
        status: client.user.presence?.status || 'online',
        isSeste: !!activeVoice,
        isMuted: activeVoice?.selfMute || false,
        isDeafened: activeVoice?.selfDeaf || false,
        isStreaming: !!session.streamer?.voiceConnection,
        connectedAt: session.connectedAt,
        config: session.config,
        token: session.token
    };
  });
  
  io.emit('sessionsUpdate', sessions);
};

const syncStaffPanel = () => {
  const stats = Array.from(staffStats.entries()).map(([id, stat]) => ({
    id,
    name: stat.name,
    avatar: stat.avatar,
    onlineTime: stat.onlineTime || 0,
    messageCount: stat.messageCount || 0,
    voiceTime: stat.voiceTime || 0
  }));
  
  io.emit('staffStatsUpdate', stats);
  io.emit('staffLogsUpdate', staffLogs.slice(-50));
};

// ====================== CLEANUP ======================
const cleanupSession = (session) => {
  try {
    if (session.voiceConnection) {
      session.voiceConnection.destroy();
    }
    if (session.streamer) {
      try { session.streamer.stopStream(); } catch (e) {}
    }
    if (session.client) {
      session.client.destroy();
    }
    activeSessions.delete(session.client.user.id);
  } catch (error) {
    console.error('[CLEANUP] Hata:', error.message);
  }
};

// ====================== STREAMING ======================
const startStream = async (session, guildId, channelId) => {
    if (!session.streamer) {
        session.streamer = new Streamer(session.client);
        // Monkey-patch to force custom mic/sound config
        session.streamer.signalVideo = function(video_enabled) {
            if (!this.voiceConnection) return;
            this.sendOpcode(4, {
                guild_id: this.voiceConnection.guildId,
                channel_id: this.voiceConnection.channelId,
                self_mute: !session.config.media.mic,
                self_deaf: !session.config.media.sound,
                self_video: video_enabled,
            });
        };
    }

    try {
        const streamAsset = session.config.cafeMode ? (fs.existsSync(CAFE_STATIC_PATH) ? CAFE_STATIC_PATH : BANNER_PATH) : BANNER_PATH;
        
        // Use discordjs/voice connection from the session if available
        if (session.voiceConnection) {
            const udp = session.voiceConnection.voiceUdp;
            if (udp) {
                session.streamer.signalVideo(!!session.config.media.camera);
                await streamLivestreamVideo(streamAsset, udp);
                console.log(`[STREAM] Yayın Aktif: ${session.client.user.username}`);
                return true;
            }
        }
    } catch (e) {
        console.error('[STREAM] Hata:', e.message);
    }
    return false;
};

// ====================== VOICE ======================
const connectToVoice = async (client, serverId, voiceId, media) => {
    const guild = await client.guilds.fetch(serverId);
    const connection = joinVoiceChannel({
      channelId: voiceId,
      guildId: serverId,
      adapterCreator: guild.voiceAdapterCreator,
      selfDeaf: !media.sound,
      selfMute: !media.mic
    });

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        connection.destroy();
        reject(new Error('Ses bağlantısı zaman aşımına uğradı (15 saniye). Eğer sistemi Render/Vercel backend üzerinden kullanıyorsanız, Discord trafiği engellenmiş olabilir.'));
      }, 15000);

      connection.on(VoiceConnectionStatus.Ready, () => {
        clearTimeout(timeout);
        resolve(connection);
      });
    });
};

// ====================== TOKEN CONNECTION ======================
const connectToken = async (data) => {
  const { token, serverId, voiceId, presence, media, proxy, activityText, streamType } = data;
  
  const client = new Client({
    checkUpdate: false,
    patchVoice: true,
    intents: [Intents.FLAGS.GUILDS, Intents.FLAGS.GUILD_VOICE_STATES, Intents.FLAGS.GUILD_MESSAGES],
    ws: { properties: { $os: 'Windows', $browser: 'Discord Client', $device: 'Discord Client' } },
    ...(proxy && { http: { agent: new (require('https-proxy-agent').HttpsProxyAgent)(proxy) } })
  });

  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => { client.destroy(); reject(new Error('Giriş zaman aşımına uğradı.')); }, 30000);

    client.on('ready', async () => {
      clearTimeout(timeout);
      
      const acts = media.stream ? [{ name: activityText || 'Dave.903 Live', type: 'STREAMING', url: 'https://twitch.tv/dave903' }] : 
                   activityText ? [{ name: activityText, type: 'PLAYING' }] : [];

      client.user.setPresence({ status: presence || 'online', activities: acts });

      const voiceConnection = await connectToVoice(client, serverId, voiceId, media);
      
      const session = {
        client, token, voiceConnection, connectedAt: Date.now(),
        config: { serverId, voiceId, presence, media, activityText, streamType, cafeMode: streamType === 'cafe' }
      };

      activeSessions.set(client.user.id, session);

      if (media.stream || media.camera || streamType === 'cafe') {
          setTimeout(() => startStream(session, serverId, voiceId), 2000);
      }

      // Reconnect Logic
      client.on('voiceStateUpdate', (oldState, newState) => {
        if (newState.member.id === client.user.id && !newState.channelId) {
            setTimeout(async () => {
                if (activeSessions.has(client.user.id)) {
                    try {
                        const newConn = await connectToVoice(client, serverId, voiceId, media);
                        session.voiceConnection = newConn;
                        if (media.stream) startStream(session, serverId, voiceId);
                    } catch (e) {}
                }
            }, 5000);
        }
      });

      syncSystemAccounts();
      resolve(client.user.username);
    });

    client.login(token).catch(reject);
  });
};

// ====================== ROUTES ======================
app.post('/api/connect', async (req, res) => {
  const { tokens, serverId: rS, voiceId: rV, presence, media, proxy, activityText, streamType } = req.body;
  const serverId = rS?.trim(); const voiceId = rV?.trim();
  
  if (!tokens || !Array.isArray(tokens)) return res.status(400).json({ error: 'Token listesi gerekli' });

  const results = { success: [], failed: [] };
  for (let token of tokens) {
    try {
      const username = await connectToken({ token: token.trim(), serverId, voiceId, presence, media, proxy, activityText, streamType });
      results.success.push(username);
    } catch (e) {
      results.failed.push({ token: token.slice(0, 15) + '...', error: e.message });
    }
  }

  res.json({
    message: `${results.success.length} hesap bağlandı${results.failed.length > 0 ? `, ${results.failed.length} başarısız` : ''}`,
    success: results.success,
    failed: results.failed
  });
});

app.post('/api/logout-all', (req, res) => {
  activeSessions.forEach(s => cleanupSession(s));
  activeSessions.clear();
  syncSystemAccounts();
  res.json({ success: true });
});

io.on('connection', (s) => { syncSystemAccounts(); syncStaffPanel(); });

server.listen(PORT, () => {
  console.log(`🚀 Dave.903 Backend sunucusu ${PORT} portunda aktif.`);
});
