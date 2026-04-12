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
const helmet = require('helmet');
const fs = require('fs');

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

const syncSystemAccounts = () => {
  const sessionsData = Array.from(activeSessions.values()).map((session) => ({
    id: session.client.user?.id, 
    token: session.token,
    username: session.client.user?.username,
    avatar: session.client.user?.displayAvatarURL(),
    isSeste: !!session.isSeste, 
    isStreaming: !!session.isStreaming, 
    config: session.config
  }));
  io.emit('sessionsUpdate', sessionsData);
};

const startStream = async (session, guildId, channelId) => {
    try {
        if (!session.streamer) session.streamer = new Streamer(session.client);
        console.log(`[STREAM] ${session.client.user.username} yayına bağlanıyor...`);
        
        await session.streamer.joinVoice(guildId, channelId);
        
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
        const asset = session.config.streamType === 'cafe' ? (fs.existsSync(CAFE_STATIC_PATH) ? CAFE_STATIC_PATH : BANNER_PATH) : BANNER_PATH;
        
        session.streamer.playVideo(asset, udp);
        session.isStreaming = true;
        session.isSeste = true;
        syncSystemAccounts();
        console.log(`[SUCCESS] ${session.client.user.username} yayını aktif.`);
    } catch (e) {
        console.error(`[STREAM ERROR] ${session.client.user.username}:`, e.message);
    }
};

const connectToken = async (data) => {
  const { token, serverId: sId, voiceId: vId, presence, media, proxy, activityText } = data;
  const serverId = sId?.trim(); const voiceId = vId?.trim();
  
  const client = new Client({
    checkUpdate: false,
    patchVoice: true,
    intents: new Intents(Intents.ALL),
    ws: { properties: { $os: 'Windows', $browser: 'Discord Client', $device: 'Discord Client' } },
    ...(proxy && { http: { agent: new HttpsProxyAgent(proxy) } })
  });

  console.log(`[LOGIN] ${token.slice(0, 15)}... giriş denemesi yapılıyor.`);

  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => { client.destroy(); reject(new Error('Discord girişi zaman aşımına uğradı. Token hatalı veya Captcha var.')); }, 30000);

    client.on('ready', async () => {
      clearTimeout(timeout);
      console.log(`[READY] ${client.user.username} olarak giriş yapıldı!`);
      
      const acts = media.stream ? [{ name: activityText || 'Dave.903 Live', type: 'STREAMING', url: 'https://twitch.tv/dave903' }] : [];
      client.user.setPresence({ status: presence || 'online', activities: acts });
      
      const session = { client, token, isStreaming: false, isSeste: false, config: { serverId, voiceId, presence, media, activityText } };
      activeSessions.set(client.user.id, session);

      try {
          if (media.camera || media.stream) {
              await startStream(session, serverId, voiceId);
          } else {
              const guild = client.guilds.cache.get(serverId);
              if (!guild) throw new Error('Sunucu bulunamadı! Bot bu sunucuda mı?');
              joinVoiceChannel({ channelId: voiceId, guildId: serverId, adapterCreator: guild.voiceAdapterCreator, selfMute: !media.mic, selfDeaf: !media.sound });
              session.isSeste = true;
              console.log(`[VOICE] ${client.user.username} sese bağlandı (Yayınsız).`);
          }
      } catch (e) { console.error(`[VOICE ERROR] ${client.user.username}:`, e.message); }

      client.on('voiceStateUpdate', (oldS, newS) => {
          if (newS.member.id === client.user.id) {
              if (!newS.channelId) {
                  console.log(`[ANTI-KICK] ${client.user.username} sesten atıldı, geri bağlanılıyor...`);
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
          }
      });

      syncSystemAccounts();
      resolve(client.user.username);
    });

    client.login(token).catch(e => {
        clearTimeout(timeout);
        console.error(`[LOGIN ERROR] Token: ${token.slice(0, 10)}:`, e.message);
        reject(e);
    });
  });
};

app.post('/api/connect', async (req, res) => {
  const { tokens, serverId, voiceId, presence, media, proxy, activityText } = req.body;
  const tList = Array.isArray(tokens) ? tokens : [req.body.token];
  
  const results = { success: [], failed: [] };
  for (const token of tList) {
    if (!token) continue;
    try {
        const username = await connectToken({ token: token.trim(), serverId, voiceId, presence, media, proxy, activityText });
        results.success.push(username);
    } catch (e) {
        results.failed.push({ token: token.slice(0, 10), error: e.message });
    }
  }
  res.json({ message: "İşlem bitti", success: results.success, failed: results.failed });
});

app.post('/api/logout-all', (req, res) => {
  activeSessions.forEach(s => s.client.destroy());
  activeSessions.clear();
  syncSystemAccounts();
  res.json({ success: true });
});

io.on('connection', (s) => { syncSystemAccounts(); });
server.listen(PORT, () => console.log(`🚀 Dave.903 Log Sistemli Sunucu: ${PORT}`));
