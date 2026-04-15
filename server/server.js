const express = require('express');
const cors = require('cors');
const { Client, Intents } = require('discord.js-selfbot-v13');
const { Server } = require('socket.io');
const http = require('http');
const { joinVoiceChannel, getVoiceConnection } = require('@discordjs/voice');
const HttpsProxyAgent = require('https-proxy-agent');
const path = require('path');
const ffmpeg = require('@ffmpeg-installer/ffmpeg');
const { Streamer } = require('@dank074/discord-video-stream');
const helmet = require('helmet');
const fs = require('fs');
const https = require('https'); // Added for self-ping logic

// --- Professional Constants ---
const RENDER_EXTERNAL_URL = process.env.RENDER_EXTERNAL_URL; // Render automatically provides this
const VERCEL_URL = process.env.VERCEL_URL;
const BASE_URL = RENDER_EXTERNAL_URL || VERCEL_URL || `http://localhost:${PORT}`;

// --- Configuration & Paths ---
const STATS_FILE = path.join(__dirname, 'data', 'staff_stats.json');
const BANNER_PATH = path.join(__dirname, 'assets', 'stream_banner.png');
const CAFE_STATIC_PATH = path.join(__dirname, 'assets', 'cafe_static.png');
const PORT = process.env.PORT || 3001;

if (!fs.existsSync(path.join(__dirname, 'data'))) {
    fs.mkdirSync(path.join(__dirname, 'data'), { recursive: true });
}

process.env.FFMPEG_PATH = ffmpeg.path;

// --- State Management ---
const activeSessions = new Map();
const RECONNECT_DELAY = 5000; // 5 seconds

// --- Utils ---
const logger = {
    info: (msg) => console.log(`[\x1b[34mINFO\x1b[0m] ${new Date().toLocaleTimeString()} - ${msg}`),
    warn: (msg) => console.warn(`[\x1b[33mWARN\x1b[0m] ${new Date().toLocaleTimeString()} - ${msg}`),
    error: (msg) => console.error(`[\x1b[31mERROR\x1b[0m] ${new Date().toLocaleTimeString()} - ${msg}`),
    success: (msg) => console.log(`[\x1b[32mSUCCESS\x1b[0m] ${new Date().toLocaleTimeString()} - ${msg}`)
};

// --- Core Web Server ---
const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*", methods: ["GET", "POST"] } });

app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors());
app.use(express.json());

const syncSystemAccounts = () => {
    const sessionsData = Array.from(activeSessions.values()).map((session) => ({
        id: session.client.user?.id,
        token: session.token,
        username: session.client.user?.username || 'Giriş Yapılıyor...',
        avatar: session.client.user?.displayAvatarURL() || '',
        isSeste: !!session.isSeste,
        isStreaming: !!session.isStreaming,
        config: session.config,
        connectedAt: session.connectedAt,
        status: session.status || 'online'
    }));
    io.emit('sessionsUpdate', sessionsData);
};

// --- Staff Tracking Engine ---
let staffStats = new Map(); // userId -> data
let staffLogs = [];

// Load stats from file
if (fs.existsSync(STATS_FILE)) {
    try {
        const data = JSON.parse(fs.readFileSync(STATS_FILE, 'utf8'));
        Object.keys(data).forEach(id => staffStats.set(id, data[id]));
    } catch (e) { logger.error("Stats yükleme hatası: " + e.message); }
}

const saveStats = () => {
    try {
        const obj = Object.fromEntries(staffStats);
        fs.writeFileSync(STATS_FILE, JSON.stringify(obj, null, 2));
    } catch (e) { logger.error("Stats kaydetme hatası: " + e.message); }
};

const addLog = (user, type, channel = '', from = '', to = '') => {
    const log = {
        id: Date.now() + Math.random(),
        user,
        type,
        channel,
        from,
        to,
        time: new Date().toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })
    };
    staffLogs.unshift(log);
    if (staffLogs.length > 50) staffLogs.pop();
    broadcastStaffUpdate();
};

const broadcastStaffUpdate = () => {
    const data = {
        staff: Array.from(staffStats.values()),
        logs: staffLogs.slice(0, 15)
    };
    io.emit('staffUpdate', data);
};

const updateStaffVoiceTime = (userId) => {
    const staff = staffStats.get(userId);
    if (!staff || !staff.lastJoin) return;
    
    const now = Date.now();
    const diff = now - staff.lastJoin;
    staff.voiceTimeSeconds = (staff.voiceTimeSeconds || 0) + Math.floor(diff / 1000);
    staff.lastJoin = now;
    
    // Format duration
    const h = Math.floor(staff.voiceTimeSeconds / 3600);
    const m = Math.floor((staff.voiceTimeSeconds % 3600) / 60);
    staff.voiceTime = `${h}s ${m}d`;
    
    staffStats.set(userId, staff);
};

// Periodic Save & Broadcast
setInterval(() => {
    // Update active voice times
    staffStats.forEach((staff, id) => {
        if (staff.channel && !staff.isAFK) {
            updateStaffVoiceTime(id);
        }
    });
    saveStats();
    broadcastStaffUpdate();
}, 10000);

// --- Bot Management Functions ---

const startStream = async (session, guildId, channelId) => {
    if (!session.streamer) session.streamer = new Streamer(session.client);
    
    try {
        await session.streamer.joinVoice(guildId, channelId);
        
        // Force Icons & State (OP 4)
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
        session.status = 'streaming';
        syncSystemAccounts();
        logger.success(`${session.client.user.username} yayını başlatıldı.`);
    } catch (e) { 
        logger.error(`Yayın Hatası (${session.client.user?.username}): ${e.message}`);
        session.isStreaming = false;
        // Schedule retry
        setTimeout(() => checkBotHealth(session), 10000);
    }
};

const checkBotHealth = async (session) => {
    if (!session.client.user) return;

    const { serverId, voiceId, media } = session.config;
    const guild = session.client.guilds.cache.get(serverId);
    
    if (!guild) {
        logger.warn(`${session.client.user.username} için sunucu bulunamadı.`);
        return;
    }

    const member = guild.members.me;
    const connection = getVoiceConnection(serverId);

    // CRITICAL: Check if connection is truly alive or just a zombie
    const isZombie = connection && connection.state.status === 'disconnected';

    if (!member.voice.channelId || member.voice.channelId !== voiceId || isZombie) {
        logger.info(`${session.client.user.username} bağlantısı tazeleniyor (Keep-Alive)...`);
        
        if (connection && isZombie) connection.destroy();

        if (media.camera || media.stream) {
            await startStream(session, serverId, voiceId);
        } else {
            try {
                const conn = joinVoiceChannel({
                    channelId: voiceId,
                    guildId: serverId,
                    adapterCreator: guild.voiceAdapterCreator,
                    selfMute: !media.mic,
                    selfDeaf: !media.sound
                });
                
                // Keep-Alive: Re-send presence every time we join/re-join
                session.client.user.setPresence({ 
                    status: session.config.presence || 'online', 
                    activities: session.isStreaming ? [{ name: session.config.activityText || 'Dave.903 Live', type: 'STREAMING', url: 'https://twitch.tv/dave903' }] : [] 
                });

                session.isSeste = true;
                session.status = 'connected';
                syncSystemAccounts();
            } catch (err) {
                logger.error(`Ses Bağlantı Hatası (${session.client.user.username}): ${err.message}`);
            }
        }
    } else {
        // Periodic Signal Pulse (OP 4) to keep gateway hot
        try {
            session.client.ws.send({
                op: 4,
                d: {
                    guild_id: serverId,
                    channel_id: voiceId,
                    self_mute: !session.config.media.mic,
                    self_deaf: !session.config.media.sound,
                    self_video: !!session.config.media.camera,
                    self_stream: !!session.config.media.stream
                }
            });
            // Update presence periodically to stay active
            session.client.user.setPresence({ 
                status: session.config.presence || 'online', 
                activities: session.isStreaming ? [{ name: session.config.activityText || 'Dave.903 Live', type: 'STREAMING', url: 'https://twitch.tv/dave903' }] : [] 
            });
        } catch (e) {
            logger.warn(`Pulse hatası (${session.client.user?.username}): ${e.message}`);
        }
    }
};

// --- Professional Keep-Alive (The Anti-Cloud-Sleep System) ---
const keepAlive = (url) => {
    if (!url) return;
    setInterval(() => {
        https.get(url, (res) => {
            if (res.statusCode === 200) {
                logger.success(`Keep-Alive: Sistem sıcak tutuluyor... (${res.statusCode})`);
            }
        }).on('error', (err) => {
            logger.error(`Keep-Alive Hatası: ${err.message}`);
        });
    }, 10 * 60 * 1000); // Every 10 minutes
};

// --- Proxy Best Practice Check ---
const validateEnvironment = () => {
    if (RENDER_EXTERNAL_URL || VERCEL_URL) {
        logger.warn("⚠️ BULUT ORTAMI TESPİT EDİLDİ: Vercel/Render üzerinde proxy olmadan selfbot çalıştırmak tokenlerin düşmesine (hesap kapanmasına) neden olabilir.");
        logger.info("💡 Profesyonel Tavsiye: Her token için ayrı bir 'Residential Proxy' kullanın.");
    }
};

const connectToken = async (data) => {
    const { token, serverId, voiceId, presence, media, activityText } = data;

    // Check if session already exists by token
    let session = Array.from(activeSessions.values()).find(s => s.token === token);
    
    if (session) {
        logger.info("Token için oturum yenileniyor...");
        try { session.client.destroy(); } catch(e) {}
        session.status = 'connecting';
    } else {
        session = {
            token,
            isStreaming: false,
            isSeste: false,
            connectedAt: Date.now(),
            status: 'connecting',
            config: { serverId: serverId.trim(), voiceId: voiceId.trim(), presence, media, activityText }
        };
    }

    const clientOptions = {
        checkUpdate: false,
        patchVoice: true,
        intents: new Intents(Intents.ALL),
        ws: { properties: { $os: 'Windows', $browser: 'Discord Client', $device: 'Discord Client' } }
    };

    // Proxy Implementation
    if (data.proxy) {
        try {
            clientOptions.http = { agent: new HttpsProxyAgent(data.proxy) };
            logger.info("Proxy aktif edildi.");
        } catch (e) { logger.error("Proxy hatası: " + e.message); }
    }

    const client = new Client(clientOptions);
    session.client = client;
    
    // Store with temporary key (token) so it shows up in UI immediately
    activeSessions.set(token, session);

    return new Promise((resolve, reject) => {
        client.on('ready', async () => {
            logger.success(`${client.user.username} başarıyla bağlandı.`);
            
            const acts = media.stream ? [{ 
                name: activityText || 'Dave.903 Live', 
                type: 'STREAMING', 
                url: 'https://twitch.tv/dave903' 
            }] : [];
            
            client.user.setPresence({ status: presence || 'online', activities: acts });
            
            // Transition from token key to userId key
            activeSessions.delete(token);
            activeSessions.set(client.user.id, session);
            
            session.status = 'ready';

            // --- DEEP SCAN: Fresh API Sync on Join ---
            const guild = client.guilds.cache.get(session.config.serverId);
            if (guild) {
                logger.info(`${guild.name} için derin tarama başlatılıyor...`);
                guild.members.cache.forEach(member => {
                    if (member.user.bot) return;
                    
                    // Update or create staff profile with fresh API data
                    let staff = staffStats.get(member.id) || { 
                        id: member.id, 
                        name: member.user.username, 
                        messageCount: 0, 
                        voiceTimeSeconds: 0, 
                        voiceTime: '0s 0d'
                    };

                    staff.role = member.roles.highest.name;
                    staff.status = member.presence?.status || 'offline';
                    
                    if (member.voice.channelId) {
                        staff.channel = member.voice.channel.name;
                        staff.isAFK = member.voice.selfDeaf || member.voice.selfMute;
                        if (!staff.lastJoin) staff.lastJoin = Date.now();
                    } else {
                        staff.channel = null;
                        staff.isAFK = false;
                        staff.lastJoin = null;
                    }
                    
                    staffStats.set(member.id, staff);
                });
                broadcastStaffUpdate();
                logger.success(`${guild.name} verileri API ile senkronize edildi.`);
            }

            await checkBotHealth(session);
            syncSystemAccounts();
            resolve(client.user.username);
        });

        // --- Global Member Activity Listeners ---
        client.on('voiceStateUpdate', (oldS, newS) => {
            // Self-logic
            if (newS.member.id === client.user.id) {
                if (!newS.channelId) {
                    session.isSeste = false;
                    session.isStreaming = false;
                    logger.warn(`${client.user.username} sesten düştü. 5sn içinde tekrar denenecek.`);
                    setTimeout(() => checkBotHealth(session), RECONNECT_DELAY);
                } else {
                    session.isSeste = true;
                }
                syncSystemAccounts();
                return;
            }

            // Staff Tracker Logic (Listen only in configured server if matches)
            if (newS.guild.id !== session.config.serverId) return;
            
            const user = newS.member.user;
            let staff = staffStats.get(user.id) || { 
                id: user.id, 
                name: user.username, 
                role: 'Yetkili', 
                messageCount: 0, 
                voiceTimeSeconds: 0, 
                voiceTime: '0s 0d',
                status: 'online' 
            };

            staff.status = newS.member.presence?.status || 'offline';

            if (!oldS.channelId && newS.channelId) { // Join
                staff.channel = newS.channel.name;
                staff.lastJoin = Date.now();
                staff.isAFK = newS.selfDeaf || newS.selfMute;
                addLog(user.username, 'join', newS.channel.name);
            } else if (oldS.channelId && !newS.channelId) { // Leave
                updateStaffVoiceTime(user.id);
                staff.channel = null;
                staff.lastJoin = null;
                staff.isAFK = false;
                addLog(user.username, 'leave', oldS.channel.name);
            } else if (oldS.channelId !== newS.channelId) { // Move
                updateStaffVoiceTime(user.id);
                staff.channel = newS.channel.name;
                staff.lastJoin = Date.now();
                addLog(user.username, 'move', '', oldS.channel.name, newS.channel.name);
            } else { // Mute/Deafen update
                staff.isAFK = newS.selfDeaf || newS.selfMute;
                if (oldS.selfMute !== newS.selfMute) addLog(user.username, newS.selfMute ? 'mute' : 'unmute');
            }

            staffStats.set(user.id, staff);
        });

        client.on('messageCreate', (message) => {
            if (message.author.bot) return;
            if (message.guild?.id !== session.config.serverId) return;

            let staff = staffStats.get(message.author.id);
            if (staff) {
                staff.messageCount = (staff.messageCount || 0) + 1;
                staffStats.set(message.author.id, staff);
                // Do not broadcast for every message to save bandwidth, heartbeat handles it
            }
        });

        client.on('disconnect', () => {
            logger.error(`${client.user?.username || 'Bilinmeyen'} bağlantısı kesildi.`);
            session.status = 'disconnected';
            syncSystemAccounts();
        });

        client.on('rateLimit', (data) => {
            logger.warn(`🛑 Hız Sınırı (Rate Limit): ${client.user?.username} - ${data.timeout}ms bekletiliyor.`);
        });

        client.on('error', (err) => {
            logger.error(`❌ Kritik Hata (${client.user?.username || 'Bilinmeyen'}): ${err.message}`);
            if (err.message.includes('401: Unauthorized') || err.message.includes('TOKEN_INVALID')) {
                logger.error(`⚠️ TOKEN DÜŞTÜ: ${token.substring(0, 10)}... artık geçersiz.`);
                session.status = 'token_invalid';
                syncSystemAccounts();
            }
        });

        client.login(token).catch(err => {
            logger.error(`Login Hatası: ${err.message}`);
            if (err.message.includes('TOKEN_INVALID')) {
                session.status = 'token_invalid';
                syncSystemAccounts();
            }
            reject(err);
        });
    });
};

// --- API Endpoints ---

app.post('/api/connect', async (req, res) => {
    const { tokens, serverId, voiceId, presence, media, activityText } = req.body;
    const tokenList = Array.isArray(tokens) ? tokens : [tokens];
    
    for (const token of tokenList) {
        if (!token) continue;
        connectToken({ 
            token: token.trim(), 
            serverId, 
            voiceId, 
            presence, 
            media, 
            activityText 
        }).catch(e => logger.error(`Bağlantı işlemi başarısız: ${e.message}`));
        
        await new Promise(r => setTimeout(r, 2000));
    }
    
    res.json({ message: "İşlem başlatıldı. Botlar sırayla bağlanıyor." });
});

app.post('/api/logout', (req, res) => {
    const { userId } = req.body;
    const session = activeSessions.get(userId);
    if (session) {
        try { session.client.destroy(); } catch(e) {}
        activeSessions.delete(userId);
        syncSystemAccounts();
        logger.info(`${session.client.user?.username} oturumu kapatıldı.`);
        res.json({ success: true });
    } else {
        res.status(404).json({ error: "Oturum bulunamadı" });
    }
});

app.post('/api/logout-all', (req, res) => {
    activeSessions.forEach(s => {
        try { s.client.destroy(); } catch(e) {}
    });
    activeSessions.clear();
    syncSystemAccounts();
    logger.info("Tüm oturumlar kapatıldı.");
    res.json({ success: true });
});

app.post('/api/update-media', async (req, res) => {
    const { tokens, media } = req.body;
    const tokenList = Array.isArray(tokens) ? tokens : [tokens];
    
    for (const t of tokenList) {
        const session = Array.from(activeSessions.values()).find(s => s.token === t);
        if (!session) continue;
        
        session.config.media = { ...session.config.media, ...media };
        
        // Apply changes to Discord
        if (session.client.readyAt) {
            const { serverId, voiceId } = session.config;
            
            // If camera/stream is enabled, ensure we are in a stream connection
            if (session.config.media.camera || session.config.media.stream) {
                await startStream(session, serverId, voiceId);
            } else {
                // Return to normal voice if was streaming
                if (session.isStreaming) {
                    try { session.streamer.stopVideo(); } catch(e) {}
                    session.isStreaming = false;
                }
                
                const guild = session.client.guilds.cache.get(serverId);
                if (guild) {
                    joinVoiceChannel({
                        channelId: voiceId,
                        guildId: serverId,
                        adapterCreator: guild.voiceAdapterCreator,
                        selfMute: !session.config.media.mic,
                        selfDeaf: !session.config.media.sound
                    });
                }
            }
            
            // Re-send status symbols (OP 4)
            try {
                session.client.ws.send({
                    op: 4,
                    d: {
                        guild_id: serverId,
                        channel_id: voiceId,
                        self_mute: !session.config.media.mic,
                        self_deaf: !session.config.media.sound,
                        self_video: !!session.config.media.camera,
                        self_stream: !!session.config.media.stream
                    }
                });
            } catch (err) {}
        }
    }
    
    syncSystemAccounts();
    res.json({ success: true });
});

// --- Maintenance Loop (The Heartbeat) ---
// Checks every 30 seconds if any bot is out of its designated channel
setInterval(() => {
    activeSessions.forEach(session => {
        if (session.client.readyAt) {
            checkBotHealth(session);
        }
    });
}, 30000);

// --- Proactive Shield (4 Hour Refresh) ---
// Prevents the common 5-hour stale gateway issues by refreshing sessions every 4 hours
setInterval(() => {
    logger.info("🛡️ Proaktif Koruma: Tüm oturumlar tazeleniyor...");
    activeSessions.forEach(session => {
        if (session.client.readyAt) {
            const conn = getVoiceConnection(session.config.serverId);
            if (conn) conn.destroy(); // Trigger a clean reconnect via health check next tick
        }
    });
}, 4 * 60 * 60 * 1000); // 4 Hours

// --- WebSocket Events ---
io.on('connection', (s) => { 
    logger.info("Yeni bir dashboard bağlantısı.");
    syncSystemAccounts(); 
    broadcastStaffUpdate(); // Sync staff data immediately
});

// --- Graceful Shutdown ---
const shutdown = () => {
    logger.info("Sistem kapatılıyor, veriler kaydediliyor...");
    saveStats();
    activeSessions.forEach(s => { try { s.client.destroy(); } catch(e) {} });
    process.exit();
};

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

// --- Startup ---
    console.log(`
    \x1b[35m██████╗  █████╗ ██╗   ██╗███████╗    █████╗ ██████╗ ██████╗ 
    ██╔══██╗██╔══██╗██║   ██║██╔════╝   ██╔══██╗██╔══██╗██╔══██╗
    ██║  ██║███████║██║   ██║█████╗     ███████║██████╔╝██████╔╝
    ██║  ██║██╔══██║╚██╗ ██╔╝██╔══╝     ██╔══██║██╔═══╝ ██╔═══╝ 
    ██████╔╝██║  ██║ ╚████╔╝ ███████╗    ██║  ██║██║     ██║     
    ╚═════╝ ╚═╝  ╚═╝  ╚═══╝  ╚══════╝    ╚═╝  ╚═╝╚═╝     ╚═╝     
    \x1b[0m
    🚀 \x1b[32mDave.903 Profesyonel Sistem Aktif!\x1b[0m
    🌐 Port: \x1b[36m${PORT}\x1b[0m
    🛡️ Koruma: \x1b[36mAktif\x1b[0m
    📊 Monitoring: \x1b[36mAktif (30s Heartsbeat)\x1b[0m
    🔗 URL: \x1b[36m${BASE_URL}\x1b[0m
    `);

    // Initialize Professional Modules
    validateEnvironment();
    if (RENDER_EXTERNAL_URL || VERCEL_URL) {
        keepAlive(BASE_URL);
    }
});

