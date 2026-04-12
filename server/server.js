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
const ALLOWED_ORIGINS = process.env.ALLOWED_ORIGINS ? process.env.ALLOWED_ORIGINS.split(',').map(o => o.trim()) : ['*']; 

const STATS_FILE = path.join(__dirname, 'data', 'staff_stats.json');
process.env.FFMPEG_PATH = ffmpeg.path;

// ====================== INITIALIZATION ======================
const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: ALLOWED_ORIGINS, methods: ["GET", "POST"], credentials: true } });

app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors({ origin: ALLOWED_ORIGINS, credentials: true }));
app.use(express.json({ limit: '10mb' }));

// Paths
const BANNER_PATH = path.join(__dirname, 'assets', 'stream_banner.png');
const CAFE_STATIC_PATH = path.join(__dirname, 'assets', 'cafe_static.png');

const activeSessions = new Map();
const staffStats = new Map();

// ====================== UTILITIES ======================
const ensureDataDir = () => { if (!fs.existsSync(path.join(__dirname, 'data'))) fs.mkdirSync(path.join(__dirname, 'data'), { recursive: true }); };

const loadStats = () => {
    try {
        ensureDataDir();
        if (fs.existsSync(STATS_FILE)) {
            const data = JSON.parse(fs.readFileSync(STATS_FILE, 'utf8'));
            Object.entries(data).forEach(([id, stats]) => staffStats.set(id, stats));
        }
    } catch (e) { console.error('[STATS] Hata:', e.message); }
};

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
        isStreaming: !!session.isStreaming,
        isCamera: !!session.isCamera,
        connectedAt: session.connectedAt,
        config: session.config,
        token: session.token
    };
  });
  io.emit('sessionsUpdate', sessions);
};

// ====================== STREAMING (FAKE CAMERA & LIVE) ======================
const startStream = async (session, guildId, channelId) => {
    if (!session.streamer) {
        session.streamer = new Streamer(session.client);
        
        // Monkey-patch for Fake Camera + Live Stream signals
        session.streamer.signalVideo = function(video_enabled, stream_enabled) {
            if (!this.voiceConnection) return;
            this.sendOpcode(4, {
                guild_id: this.voiceConnection.guildId,
                channel_id: this.voiceConnection.channelId,
                self_mute: !session.config.media.mic,
                self_deaf: !session.config.media.sound,
                self_video: video_enabled, // KAMERA İKONU
                self_stream: stream_enabled // YAYINDA (LIVE) İKONU
            });
        };
    }

    try {
        const streamAsset = session.config.streamType === 'cafe' ? (fs.existsSync(CAFE_STATIC_PATH) ? CAFE_STATIC_PATH : BANNER_PATH) : BANNER_PATH;
        
        if (session.voiceConnection) {
            const udp = session.voiceConnection.voiceUdp;
            if (udp) {
                // Her iki sinyali de gönder (Yayın + Kamera)
                session.streamer.signalVideo(!!session.config.media.camera, !!session.config.media.stream);
                
                await streamLivestreamVideo(streamAsset, udp, {
                    width: 1280,
                    height: 720,
                    fps: 30,
                    bitrateKbps: 2000,
                    videoCodec: 'H264'
                });

                session.isStreaming = !!session.config.media.stream;
                session.isCamera = !!session.config.media.camera;
                
                console.log(`[FAKE-CAM] ${session.client.user.username} için yayın ve kamera açıldı.`);
                syncSystemAccounts();
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
      selfMute: !media.mic,
      selfVideo: !!media.camera
    });

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => { connection.destroy(); reject(new Error('Ses zaman aşımı.')); }, 15000);
      connection.on(VoiceConnectionStatus.Ready, () => { clearTimeout(timeout); resolve(connection); });
    });
};

// ====================== TOKEN CONNECTION ======================
const connectToken = async (data) => {
  const { token, serverId, voiceId, presence, media, proxy, activityText, streamType } = data;
  
  const client = new Client({
    checkUpdate: false,
    patchVoice: true,
    intents: [Intents.FLAGS.GUILDS, Intents.FLAGS.GUILD_VOICE_STATES],
    ws: { properties: { $os: 'Windows', $browser: 'Discord Client', $device: 'Discord Client' } },
    ...(proxy && { http: { agent: new (require('https-proxy-agent').HttpsProxyAgent)(proxy) } })
  });

  return new Promise((resolve, reject) => {
    client.on('ready', async () => {
      const acts = media.stream ? [{ name: activityText || 'Dave.903 Live', type: 'STREAMING', url: 'https://twitch.tv/dave903' }] : 
                   activityText ? [{ name: activityText, type: 'PLAYING' }] : [];

      client.user.setPresence({ status: presence || 'online', activities: acts });

      const voiceConnection = await connectToVoice(client, serverId, voiceId, media);
      
      const session = {
        client, token, voiceConnection, connectedAt: Date.now(), isStreaming: false, isCamera: false,
        config: { serverId, voiceId, presence, media, activityText, streamType }
      };

      activeSessions.set(client.user.id, session);

      // Yayın ve Kamera Fake Başlatma
      if (media.stream || media.camera) {
          setTimeout(() => startStream(session, serverId, voiceId), 2000);
      }

      syncSystemAccounts();
      resolve(client.user.username);
    });

    client.login(token).catch(reject);
  });
};

// ====================== ROUTES ======================
app.post('/api/connect', async (req, res) => {
  const { tokens, serverId: rS, voiceId: rV, presence, media, proxy, activityText, streamType } = req.body;
  const results = { success: [], failed: [] };
  
  for (let token of tokens) {
    try {
      const username = await connectToken({ token: token.trim(), serverId: rS?.trim(), voiceId: rV?.trim(), presence, media, proxy, activityText, streamType });
      results.success.push(username);
    } catch (e) {
      results.failed.push({ token: token.slice(0, 10), error: e.message });
    }
  }

  res.json({ message: `${results.success.length} hesap bağlandı`, success: results.success, failed: results.failed });
});

app.post('/api/logout-all', (req, res) => {
  activeSessions.forEach(s => { try { s.voiceConnection.destroy(); s.client.destroy(); } catch(e){} });
  activeSessions.clear();
  syncSystemAccounts();
  res.json({ success: true });
});

io.on('connection', (s) => { syncSystemAccounts(); });

server.listen(PORT, () => { console.log(`🚀 Dave.903 Backend aktif: ${PORT}`); });
