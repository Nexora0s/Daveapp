const express = require('express');
const cors = require('cors');
const { Client, Intents } = require('discord.js-selfbot-v13');
const { Server } = require('socket.io');
const http = require('http');
const { joinVoiceChannel } = require('@discordjs/voice');
const HttpsProxyAgent = require('https-proxy-agent');
const path = require('path');
const ffmpeg = require('@ffmpeg-installer/ffmpeg');
const { Streamer } = require('@dank074/discord-video-stream');
const rateLimit = require('express-rate-limit');
const helmet = require('helmet');
const fs = require('fs');

const STATS_FILE = path.join(__dirname, 'data', 'staff_stats.json');
if (!fs.existsSync(path.join(__dirname, 'data'))) fs.mkdirSync(path.join(__dirname, 'data'), { recursive: true });

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
let staffLogs = [];

// ====================== ESKI MANTIK (BOZULMADAN) ======================
const syncSystemAccounts = () => {
  const sessionsData = Array.from(activeSessions.values()).map((session) => ({
    id: session.client.user?.id, 
    token: session.token,
    username: session.client.user?.username,
    avatar: session.client.user?.displayAvatarURL(),
    isSeste: !!session.isSeste, 
    isStreaming: !!session.isStreaming, 
    config: session.config,
    connectedAt: session.connectedAt
  }));
  io.emit('sessionsUpdate', sessionsData);
};

// ====================== YAYIN & IKON FIX ======================
const startStream = async (session, guildId, channelId) => {
    if (!session.streamer) session.streamer = new Streamer(session.client);
    try {
        await session.streamer.joinVoice(guildId, channelId);
        
        // IKONLARI ZORLA GÖSTER (OP 4)
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
    } catch (e) { console.error('Stream error:', e.message); }
};

// ====================== BAGLANTI & AUTO-RECONNECT ======================
const connectToken = async (data) => {
  const { token, serverId, voiceId, presence, media, proxy, activityText } = data;
  const client = new Client({
    checkUpdate: false,
    patchVoice: true,
    intents: new Intents(Intents.ALL),
    ws: { properties: { $os: 'Windows', $browser: 'Discord Client', $device: 'Discord Client' } }
  });

  return new Promise((resolve, reject) => {
    client.on('ready', async () => {
      const acts = media.stream ? [{ name: activityText || 'Dave.903 Live', type: 'STREAMING', url: 'https://twitch.tv/dave903' }] : [];
      client.user.setPresence({ status: presence || 'online', activities: acts });
      
      const session = { client, token, isStreaming: false, isSeste: false, config: { serverId: serverId.trim(), voiceId: voiceId.trim(), presence, media, activityText } };
      activeSessions.set(client.user.id, session);

      // SESE GIR
      if (media.camera || media.stream) {
          await startStream(session, session.config.serverId, session.config.voiceId);
      } else {
          const guild = client.guilds.cache.get(session.config.serverId);
          if (guild) joinVoiceChannel({ channelId: session.config.voiceId, guildId: session.config.serverId, adapterCreator: guild.voiceAdapterCreator, selfMute: !media.mic, selfDeaf: !media.sound });
          session.isSeste = true;
      }

      // OTO RECONNECT (2 SN)
      client.on('voiceStateUpdate', (oldS, newS) => {
          if (newS.member.id === client.user.id && !newS.channelId) {
              setTimeout(async () => {
                  if (activeSessions.has(client.user.id)) {
                      const s = activeSessions.get(client.user.id);
                      if (s.config.media.camera || s.config.media.stream) await startStream(s, s.config.serverId, s.config.voiceId);
                      else {
                          const g = client.guilds.cache.get(s.config.serverId);
                          if (g) joinVoiceChannel({ channelId: s.config.voiceId, guildId: s.config.serverId, adapterCreator: g.voiceAdapterCreator, selfMute: !s.config.media.mic, selfDeaf: !s.config.media.sound });
                      }
                  }
              }, 2000);
          }
          syncSystemAccounts();
      });

      syncSystemAccounts();
      resolve(client.user.username);
    });
    client.login(token).catch(reject);
  });
};

app.post('/api/connect', async (req, res) => {
  const { tokens, serverId, voiceId, presence, media } = req.body;
  for (const token of (Array.isArray(tokens) ? tokens : [token])) {
    if (!token) continue;
    connectToken({ token: token.trim(), serverId, voiceId, presence, media }).catch(e => console.error(e.message));
    await new Promise(r => setTimeout(r, 1500));
  }
  res.json({ message: "Başlatıldı" });
});

app.post('/api/logout-all', (req, res) => {
  activeSessions.forEach(s => s.client.destroy());
  activeSessions.clear();
  syncSystemAccounts();
  res.json({ success: true });
});

io.on('connection', (s) => { syncSystemAccounts(); });
server.listen(PORT, () => console.log(`🚀 Dave.903 Guncel Sunucu: ${PORT}`));
