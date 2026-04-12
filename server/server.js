const express = require('express');
const cors = require('cors');
const { Client } = require('discord.js-selfbot-v13');
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
if (!fs.existsSync(path.join(__dirname, 'data'))) fs.mkdirSync(path.join(__dirname, 'data'));

// FFmpeg setup
process.env.FFMPEG_PATH = ffmpeg.path;

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: "http://localhost:5173", methods: ["GET", "POST"] }
});

// Security Middlewares (DDoS Protection)
app.use(helmet());
app.use(cors());
app.use(express.json());

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, 
  max: 100, 
  message: { error: 'Çok fazla istek gönderildi. Lütfen daha sonra tekrar deneyin (DDoS Koruması).' }
});
app.use('/api/', limiter);

const BANNER_PATH = path.join(__dirname, 'assets', 'stream_banner.png');
const CAFE_STATIC_PATH = path.join(__dirname, 'assets', 'cafe_static.png');
const activeSessions = new Map();
const staffStats = new Map(); // userId -> { name, role, status, channel, voiceTimeMs, lastJoinTime, messageCount }
const monitoredGuilds = new Map(); // guildId -> clientId (The client currently monitoring)
let staffLogs = [];

// Socket Throttle Logic
let syncAccountsTimeout = null;
let syncStaffTimeout = null;
const throttledSyncAccounts = () => { if (!syncAccountsTimeout) syncAccountsTimeout = setTimeout(() => { syncSystemAccounts(); syncAccountsTimeout = null; }, 1000); };
const throttledSyncStaff = () => { if (!syncStaffTimeout) syncStaffTimeout = setTimeout(() => { syncStaffPanel(); syncStaffTimeout = null; }, 1000); };

const loadStats = () => {
    try {
        if (fs.existsSync(STATS_FILE)) {
            const data = JSON.parse(fs.readFileSync(STATS_FILE));
            Object.entries(data).forEach(([id, stats]) => staffStats.set(id, stats));
        }
    } catch (e) { console.error('Stats loading error:', e); }
};

const saveStats = () => {
    try {
        const data = {};
        staffStats.forEach((stats, id) => {
            const saveObj = { ...stats };
            if (saveObj.lastJoinTime && saveObj.channel) {
                saveObj.voiceTimeMs += (Date.now() - saveObj.lastJoinTime);
                saveObj.lastJoinTime = Date.now();
            }
            data[id] = saveObj;
        });
        fs.writeFileSync(STATS_FILE, JSON.stringify(data, null, 2));
    } catch (e) { console.error('Stats saving error:', e); }
};

loadStats();
setInterval(saveStats, 300000); // Auto-save every 5 mins

const syncSystemAccounts = () => {
  const sessionsData = [];
  activeSessions.forEach((session) => {
    const client = session.client;
    if (client.user && client.readyAt) {
      let activeVoice = null;
      client.guilds.cache.forEach(guild => {
        const vs = guild.members.me?.voice;
        if (vs && vs.channelId) activeVoice = vs;
      });
      
      sessionsData.push({
        id: client.user.id, 
        token: session.token, // Necessary for sidebar toggling
        username: client.user.username,
        displayName: client.user.tag, 
        avatar: client.user.displayAvatarURL(),
        status: client.user.presence ? client.user.presence.status : 'online',
        isSeste: !!activeVoice, 
        isStreaming: !!session.udp, 
        isMuted: activeVoice?.selfMute || false, 
        isDeafened: activeVoice?.selfDeaf || false,
        isCamera: activeVoice?.selfVideo || false,
        config: session.config, // Crucial for button state coloring
        connectedAt: session.connectedAt
      });
    }
  });
  io.emit('sessionsUpdate', sessionsData);
};

io.on('connection', (socket) => {
  // Sync when a client reloads the page
  syncSystemAccounts();
  syncStaffPanel();
});

const syncStaffPanel = () => {
  const staffArray = Array.from(staffStats.values()).map(s => {
    let currentVoiceTime = s.voiceTimeMs;
    if (s.lastJoinTime && s.channel) {
       currentVoiceTime += (Date.now() - s.lastJoinTime);
    }
    const totalMinutes = Math.floor(currentVoiceTime / 60000);
    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;
    
    return {
      ...s,
      voiceTime: `${hours}sa ${minutes}dk`,
      isAFK: s.channel?.toLowerCase().includes('afk') || false
    };
  });
  
  io.emit('staffUpdate', {
    staff: staffArray,
    logs: staffLogs.slice(-20) // Send last 20 logs
  });
};

const cleanupSession = (session) => {
    try {
        const userId = session.client.user?.id;
        stopStream(session);
        
        // YSP Handover logic
        monitoredGuilds.forEach((monitoringClientId, guildId) => {
            if (monitoringClientId === userId) {
                monitoredGuilds.delete(guildId);
                console.log(`[STABILITY] Monitoring client ${userId} disconnected for guild ${guildId}. searching for replacement...`);
                
                // Find another client in the same guild
                let replacement = null;
                activeSessions.forEach((otherSession, otherUserId) => {
                    if (otherUserId !== userId && otherSession.client.guilds.cache.has(guildId)) {
                        replacement = otherSession;
                    }
                });

                if (replacement) {
                    setupGuildMonitoring(replacement.client, guildId);
                    console.log(`[STABILITY] Handover successful: Client ${replacement.client.user.id} is now monitoring ${guildId}`);
                } else {
                    console.log(`[STABILITY] No other clients in guild ${guildId}. Monitoring stopped.`);
                }
            }
        });

        if (session.client) {
            session.client.removeAllListeners();
            session.client.destroy();
        }
    } catch (e) {
        console.error('Cleanup error:', e);
    }
};

const setupGuildMonitoring = (client, serverId) => {
    if (monitoredGuilds.has(serverId)) return;
    monitoredGuilds.set(serverId, client.user.id);
    console.log(`[STABILITY] Centralized YSP tracker started for server: ${serverId} (using client: ${client.user.username})`);
    
    client.on('voiceStateUpdate', (oldState, newState) => {
        if (newState.guild.id !== serverId) return;
        const member = newState.member;
        if (!member) return;
        
        const uid = member.id;
        const staffKeywords = ['admin', 'mod', 'yetkili', 'staff', 'owner', 'kurucu', 'rehber', 'yonetim'];
        const isStaff = member.roles.cache.some(r => staffKeywords.some(key => r.name.toLowerCase().includes(key)));
        
        if (!isStaff && !staffStats.has(uid)) return;

        let stats = staffStats.get(uid) || { id: uid, name: member.user.username, role: member.roles.highest.name, status: member.user.presence?.status || 'offline', voiceTimeMs: 0, lastJoinTime: null, channel: null, messageCount: 0 };
        stats.name = member.user.username;
        stats.status = member.presence?.status || 'offline';
        stats.role = member.roles.highest.name;

        if (!oldState.channelId && newState.channelId) {
            stats.channel = newState.channel.name;
            stats.lastJoinTime = Date.now();
            addStaffLog(stats.name, 'join', { channel: stats.channel });
        } else if (oldState.channelId && !newState.channelId) {
            if (stats.lastJoinTime) stats.voiceTimeMs += (Date.now() - stats.lastJoinTime);
            stats.lastJoinTime = null;
            stats.channel = null;
            addStaffLog(stats.name, 'leave', { channel: oldState.channel.name });
        } else if (oldState.channelId !== newState.channelId) {
            if (stats.lastJoinTime) stats.voiceTimeMs += (Date.now() - stats.lastJoinTime);
            stats.lastJoinTime = Date.now();
            stats.channel = newState.channel.name;
            addStaffLog(stats.name, 'move', { from: oldState.channel.name, to: newState.channel.name });
        }
        if (!oldState.selfMute && newState.selfMute) addStaffLog(stats.name, 'mute', { channel: stats.channel });
        if (oldState.selfMute && !newState.selfMute) addStaffLog(stats.name, 'unmute', { channel: stats.channel });
        if (!oldState.selfDeaf && newState.selfDeaf) addStaffLog(stats.name, 'deafen', { channel: stats.channel });

        staffStats.set(uid, stats);
        throttledSyncStaff();
    });

    client.on('messageCreate', (msg) => {
        if (msg.author.bot || msg.guild?.id !== serverId) return;
        const member = msg.member;
        if (!member) return;
        const staffKeywords = ['admin', 'mod', 'yetkili', 'staff', 'owner', 'kurucu', 'rehber', 'yonetim'];
        const isStaff = member.roles.cache.some(r => staffKeywords.some(key => r.name.toLowerCase().includes(key)));

        if (isStaff) {
            let stats = staffStats.get(msg.author.id) || { id: msg.author.id, name: msg.author.username, role: member.roles.highest.name, status: msg.author.presence?.status || 'online', voiceTimeMs: 0, lastJoinTime: null, channel: null, messageCount: 0 };
            stats.messageCount = (stats.messageCount || 0) + 1;
            staffStats.set(msg.author.id, stats);
            throttledSyncStaff();
        }
    });
};

const addStaffLog = (user, type, details) => {
  const log = { id: Date.now(), user, type, ...details, time: 'Az önce' };
  staffLogs.unshift(log);
  if (staffLogs.length > 50) staffLogs.pop();
};

const stopStream = (session) => {
    if (session.streamer && session.udp) {
        try { session.streamer.stopVideo(); session.udp = null; } catch (e) {}
    }
};

const getStreamAsset = (session) => {
    const streamType = session.config?.streamType || 'banner';
    return streamType === 'cafe' ? CAFE_STATIC_PATH : BANNER_PATH;
};

const startStream = async (session, guildId, channelId) => {
    if (!session.streamer) {
        session.streamer = new Streamer(session.client);
        // Monkey-patch to bypass developer's hardcoded self_deaf: true
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
        stopStream(session);
        await session.streamer.joinVoice(guildId, channelId);
        
        // This will now correctly send Mic/Sound config + Camera state via websocket automatically!
        session.streamer.signalVideo(!!session.config.media.camera);

        const udp = await session.streamer.createStream();
        session.udp = udp;
        
        // Start showing video stream with the appropriate asset (banner or cafe static)
        const asset = getStreamAsset(session);
        console.log(`[STREAM] Playing ${session.config?.streamType || 'banner'} stream for ${session.client.user?.username}`);
        session.streamer.playVideo(asset, udp);
    } catch (e) {
        console.error('Streaming error:', e.message);
    }
};

const connectToken = async (data) => {
  const { token, serverId, voiceId, presence, media, proxy, activityText, streamType, cafeMode } = data;
  const options = { checkUpdate: false };
  if (proxy) options.http = { agent: new HttpsProxyAgent(proxy) };
  
  const client = new Client(options);

  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => { client.destroy(); reject(new Error('Bağlantı zaman aşımına uğradı.')); }, 30000);

    client.on('ready', async () => {
      clearTimeout(timeout);
      const userId = client.user.id;
      if (activeSessions.has(userId)) cleanupSession(activeSessions.get(userId));

      // Cafe mode overrides: always streaming with cafe activity
      const effectiveMedia = cafeMode ? { mic: false, sound: false, camera: true, stream: true } : media;
      const effectiveStreamType = cafeMode ? 'cafe' : (streamType || 'banner');
      const effectiveActivity = cafeMode ? (activityText || '☕ Kafe Kamera 24/7') : activityText;

      const acts = effectiveMedia.stream ? [{ name: effectiveActivity || 'Dave.903 Live', type: 'STREAMING', url: 'https://twitch.tv/dave903' }] : 
                   effectiveActivity ? [{ name: effectiveActivity, type: 'PLAYING' }] : [];

      client.user.setPresence({ status: presence || 'online', activities: acts });
      
      const guild = client.guilds.cache.get(serverId);
      const session = { client, token, proxy, config: { serverId, voiceId, presence, media: effectiveMedia, activityText: effectiveActivity, streamType: effectiveStreamType, cafeMode: !!cafeMode }, streamer: null, udp: null, connectedAt: Date.now() };
      activeSessions.set(userId, session);

      if (guild) {
          if (effectiveMedia.camera || effectiveMedia.stream) await startStream(session, serverId, voiceId);
          else joinVoiceChannel({ channelId: voiceId, guildId: serverId, adapterCreator: guild.voiceAdapterCreator, selfMute: !effectiveMedia.mic, selfDeaf: !effectiveMedia.sound, selfVideo: false });
      }
      syncSystemAccounts();
      
      // Auto-Reconnect Logic
      client.on('voiceStateUpdate', (oldState, newState) => {
        if (newState.member.id === client.user.id && !newState.channelId) {
          if (activeSessions.has(client.user.id)) {
            const sess = activeSessions.get(client.user.id);
            setTimeout(async () => {
              if (activeSessions.has(client.user.id)) {
                const g = client.guilds.cache.get(sess.config.serverId);
                if (g) {
                  try {
                    if (sess.config.media.camera || sess.config.media.stream) await startStream(sess, sess.config.serverId, sess.config.voiceId);
                    else joinVoiceChannel({ channelId: sess.config.voiceId, guildId: sess.config.serverId, adapterCreator: g.voiceAdapterCreator, selfMute: !sess.config.media.mic, selfDeaf: !sess.config.media.sound, selfVideo: false });
                  } catch (e) {}
                }
              }
            }, 5000);
          }
        }
      });

      setupGuildMonitoring(client, serverId);


      resolve(client.user.username);
    });

    client.on('error', (err) => { clearTimeout(timeout); reject(err); });
    client.login(token).catch(e => { clearTimeout(timeout); reject(e); });
  });
};

app.post('/api/connect', async (req, res) => {
  const { tokens, serverId, voiceId, presence, media, proxy, activityText } = req.body;
  const tokenList = Array.isArray(tokens) ? tokens : [req.body.token];
  
  const results = { success: [], failed: [] };
  
  for (const token of tokenList) {
    if (!token) continue;
    try {
        const username = await connectToken({ token, serverId, voiceId, presence, media, proxy, activityText });
        results.success.push(username);
        // Rate limit protection for Discord
        await new Promise(r => setTimeout(r, 2000));
    } catch (e) {
        results.failed.push({ token: token.slice(0, 10), error: e.message });
    }
  }

  res.json({ message: `${results.success.length} hesap bağlandı, ${results.failed.length} hata.`, results });
});

app.post('/api/update-media', async (req, res) => {
  const { tokens, media } = req.body;
  const tokenList = Array.isArray(tokens) ? tokens : [req.body.token].filter(t => t);
  
  const results = { success: 0, failed: 0 };

  for (const token of tokenList) {
    let session = null;
    activeSessions.forEach(s => { if (s.token === token) session = s; });

    if (session) {
      try {
        session.config.media = media; // Update config first
        const guild = session.client.guilds.cache.get(session.config.serverId);
        const me = guild?.members.me;
        
        if (me && me.voice.channelId) {
            // Update Media instantly via WebSocket OP 4
            session.client.ws.send({
                op: 4,
                d: {
                    guild_id: session.config.serverId,
                    channel_id: me.voice.channelId,
                    self_mute: !media.mic,
                    self_deaf: !media.sound,
                    self_video: !!media.camera
                }
            });
            
            // Re-evaluate Media Streams
            if (media.camera || media.stream) {
                await startStream(session, session.config.serverId, session.config.voiceId);
            } else {
                stopStream(session);
            }

            // Update Presence based on stream toggle (YAYINDA status)
            const acts = media.stream ? [{ name: session.config.activityText || 'Dave.903 Live', type: 'STREAMING', url: 'https://twitch.tv/dave903' }] : 
                         session.config.activityText ? [{ name: session.config.activityText, type: 'PLAYING' }] : [];
            session.client.user.setPresence({ status: session.config.presence || 'online', activities: acts });

            results.success++;
        } else { results.failed++; }
      } catch (e) { console.error('Update media error:', e); results.failed++; }
    } else { results.failed++; }
  }

  syncSystemAccounts();
  throttledSyncAccounts();
  res.json({ message: `${results.success} hesap güncellendi.`, success: results.success > 0 });
});

// Cafe Mode - One-click cafe camera with broken screen 24/7
app.post('/api/cafe-mode', async (req, res) => {
  const { tokens, serverId, voiceId, presence, proxy, activityText, enable } = req.body;
  const tokenList = Array.isArray(tokens) ? tokens : [req.body.token].filter(t => t);

  if (enable) {
    // Enable cafe mode: connect with camera+stream+cafe static
    const results = { success: [], failed: [] };
    for (const token of tokenList) {
      if (!token) continue;
      try {
        const username = await connectToken({
          token, serverId, voiceId, presence,
          media: { mic: false, sound: false, camera: true, stream: true },
          proxy, activityText: activityText || '☕ Kafe Kamera 24/7',
          streamType: 'cafe', cafeMode: true
        });
        results.success.push(username);
        await new Promise(r => setTimeout(r, 2000));
      } catch (e) {
        results.failed.push({ token: token.slice(0, 10), error: e.message });
      }
    }
    res.json({ message: `☕ Kafe Modu: ${results.success.length} hesap bağlandı.`, results });
  } else {
    // Disable cafe mode for active sessions
    let updated = 0;
    for (const token of tokenList) {
      let session = null;
      activeSessions.forEach(s => { if (s.token === token) session = s; });
      if (session) {
        session.config.cafeMode = false;
        session.config.streamType = 'banner';
        updated++;
      }
    }
    res.json({ message: `${updated} hesap normal moda döndü.` });
  }
});

// Update stream type (banner/cafe) for active sessions
app.post('/api/update-stream-type', async (req, res) => {
  const { tokens, streamType } = req.body;
  const tokenList = Array.isArray(tokens) ? tokens : [req.body.token].filter(t => t);
  const results = { success: 0, failed: 0 };

  for (const token of tokenList) {
    let session = null;
    activeSessions.forEach(s => { if (s.token === token) session = s; });
    if (session) {
      try {
        session.config.streamType = streamType || 'banner';
        if (session.udp) {
          // Re-start stream with new asset
          await startStream(session, session.config.serverId, session.config.voiceId);
        }
        results.success++;
      } catch (e) { results.failed++; }
    } else { results.failed++; }
  }
  syncSystemAccounts();
  res.json({ message: `${results.success} hesabın yayın tipi güncellendi.`, success: results.success > 0 });
});

app.post('/api/logout', (req, res) => {
  const { userId } = req.body;
  const session = activeSessions.get(userId);
  if (session) {
    const sId = session.config.serverId;
    cleanupSession(session); activeSessions.delete(userId);
    
    // Check if any other session is still in this server
    const stillMonitored = Array.from(activeSessions.values()).some(s => s.config.serverId === sId);
    if (!stillMonitored) monitoredGuilds.delete(sId);

    throttledSyncAccounts(); res.json({ message: 'Çıkış yapıldı.' });
  } else res.status(404).json({ error: 'Yok.' });
});

app.post('/api/logout-all', (req, res) => {
  activeSessions.forEach(s => cleanupSession(s)); activeSessions.clear();
  monitoredGuilds.clear();
  throttledSyncAccounts(); res.json({ message: 'Hepsi kapatıldı.' });
});

// Final Shutdown Hook
process.on('SIGINT', () => {
    console.log('[STABILITY] Saving stats before shutdown...');
    saveStats();
    process.exit();
});

const PORT = 3001;
server.listen(PORT, () => {
    console.log(`Dave.903 Güvenli Medya Sunucusu http://localhost:${PORT} uzerinde calisiyor.`);
});
