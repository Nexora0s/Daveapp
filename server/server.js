const express = require('express');
const cors = require('cors');
const { Client, Intents } = require('discord.js-selfbot-v13');
const { Server } = require('socket.io');
const http = require('http');
const { joinVoiceChannel, VoiceConnectionStatus } = require('@discordjs/voice');
const HttpsProxyAgent = require('https-proxy-agent');
const path = require('path');
const ffmpeg = require('@ffmpeg-installer/ffmpeg');
const { Streamer, streamLivestreamVideo } = require('@dank074/discord-video-stream');
const rateLimit = require('express-rate-limit');
const helmet = require('helmet');
const fs = require('fs');

const STATS_FILE = path.join(__dirname, 'data', 'staff_stats.json');
if (!fs.existsSync(path.join(__dirname, 'data'))) fs.mkdirSync(path.join(__dirname, 'data'));

process.env.FFMPEG_PATH = ffmpeg.path;
const PORT = process.env.PORT || 3001;

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*", methods: ["GET", "POST"] } });

app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors());
app.use(express.json());

const BANNER_PATH = path.join(__dirname, 'assets', 'stream_banner.png');
const CAFE_STATIC_PATH = path.join(__dirname, 'assets', 'cafe_static.png');
const activeSessions = new Map();
const staffStats = new Map();
const monitoredGuilds = new Map();
let staffLogs = [];

// ====================== SYNC & STATS ======================
const loadStats = () => {
    try {
        if (fs.existsSync(STATS_FILE)) {
            const data = JSON.parse(fs.readFileSync(STATS_FILE));
            Object.entries(data).forEach(([id, stats]) => staffStats.set(id, stats));
        }
    } catch (e) { console.error('Stats load error:', e); }
};
loadStats();

const syncSystemAccounts = () => {
  const sessionsData = [];
  activeSessions.forEach((session) => {
    const client = session.client;
    if (client.user && client.readyAt) {
      sessionsData.push({
        id: client.user.id, 
        token: session.token,
        username: client.user.username,
        avatar: client.user.displayAvatarURL(),
        status: client.user.presence?.status || 'online',
        isSeste: !!session.isSeste, 
        isStreaming: !!session.isStreaming, 
        config: session.config,
        connectedAt: session.connectedAt
      });
    }
  });
  io.emit('sessionsUpdate', sessionsData);
};

// ====================== STREAMING CORE ======================
const startStream = async (session, guildId, channelId) => {
    if (!session.streamer) {
        session.streamer = new Streamer(session.client);
    }

    try {
        await session.streamer.joinVoice(guildId, channelId);
        
        // FORCE SIGNAL (IKONLAR ICIN)
        session.client.ws.send({
            op: 4,
            d: {
                guild_id: guildId,
                channel_id: channelId,
                self_mute: !session.config.media.mic,
                self_deaf: !session.config.media.sound,
                self_video: !!session.config.media.camera,
                self_stream: !!session.config.media.stream
            }
        });

        const udp = await session.streamer.createStream();
        const asset = session.config.streamType === 'cafe' ? CAFE_STATIC_PATH : BANNER_PATH;
        
        session.streamer.playVideo(asset, udp);
        session.isStreaming = true;
        session.isSeste = true;
        syncSystemAccounts();
    } catch (e) {
        console.error('Streaming error:', e.message);
    }
};

// ====================== CONNECTION LOGIC ======================
const connectToken = async (data) => {
  const { token, serverId, voiceId, presence, media, proxy, activityText, streamType, cafeMode } = data;
  const options = { 
      checkUpdate: false, 
      patchVoice: true,
      intents: new Intents(Intents.ALL),
      ws: { properties: { $os: 'Windows', $browser: 'Discord Client', $device: 'Discord Client' } }
  };
  if (proxy) options.http = { agent: new HttpsProxyAgent(proxy) };
  
  const client = new Client(options);

  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => { client.destroy(); reject(new Error('Zaman aşımı.')); }, 30000);

    client.on('ready', async () => {
      clearTimeout(timeout);
      
      client.user.setPresence({ 
          status: presence || 'online', 
          activities: media.stream ? [{ name: activityText || 'Dave.903 Live', type: 'STREAMING', url: 'https://twitch.tv/dave903' }] : [] 
      });
      
      const guild = client.guilds.cache.get(serverId);
      const session = { 
          client, token, isStreaming: false, isSeste: false,
          config: { serverId, voiceId, presence, media, activityText, streamType } 
      };
      activeSessions.set(client.user.id, session);

      if (guild) {
          if (media.camera || media.stream) {
              await startStream(session, serverId, voiceId);
          } else {
              joinVoiceChannel({ 
                  channelId: voiceId, guildId: serverId, adapterCreator: guild.voiceAdapterCreator, 
                  selfMute: !media.mic, selfDeaf: !media.sound 
              });
              session.isSeste = true;
          }
      }
      
      syncSystemAccounts();
      resolve(client.user.username);
    });

    client.login(token).catch(reject);
  });
};

app.post('/api/connect', async (req, res) => {
  const { tokens, serverId, voiceId, presence, media, proxy, activityText } = req.body;
  const tList = Array.isArray(tokens) ? tokens : [req.body.token];
  
  for (const token of tList) {
    if (!token) continue;
    try {
        await connectToken({ token: token.trim(), serverId, voiceId, presence, media, proxy, activityText });
        await new Promise(r => setTimeout(r, 2000));
    } catch (e) { console.error(e.message); }
  }
  res.json({ message: "İşlem başlatıldı." });
});

app.post('/api/logout-all', (req, res) => {
  activeSessions.forEach(s => s.client.destroy());
  activeSessions.clear();
  syncSystemAccounts();
  res.json({ success: true });
});

io.on('connection', (s) => { syncSystemAccounts(); });

server.listen(PORT, () => console.log(`🚀 Dave.903 Sunucusu Aktif: ${PORT}`));
