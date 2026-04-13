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
    if (!member.voice.channelId || member.voice.channelId !== voiceId) {
        logger.info(`${session.client.user.username} kanaldan düşmüş, tekrar bağlanılıyor...`);
        
        if (media.camera || media.stream) {
            await startStream(session, serverId, voiceId);
        } else {
            try {
                joinVoiceChannel({
                    channelId: voiceId,
                    guildId: serverId,
                    adapterCreator: guild.voiceAdapterCreator,
                    selfMute: !media.mic,
                    selfDeaf: !media.sound
                });
                session.isSeste = true;
                session.status = 'connected';
                syncSystemAccounts();
            } catch (err) {
                logger.error(`Ses Bağlantı Hatası (${session.client.user.username}): ${err.message}`);
            }
        }
    }
};

const connectToken = async (data) => {
    const { token, serverId, voiceId, presence, media, activityText } = data;

    // Check if duplicate
    const existing = Array.from(activeSessions.values()).find(s => s.token === token);
    if (existing) {
        logger.info("Token zaten aktif, oturum yenileniyor...");
        existing.client.destroy();
        activeSessions.delete(existing.client.user?.id);
    }

    const client = new Client({
        checkUpdate: false,
        patchVoice: true,
        intents: new Intents(Intents.ALL),
        ws: { 
            properties: { 
                $os: 'Windows', 
                $browser: 'Discord Client', 
                $device: 'Discord Client' 
            } 
        }
    });

    const session = {
        client,
        token,
        isStreaming: false,
        isSeste: false,
        connectedAt: Date.now(),
        status: 'connecting',
        config: { 
            serverId: serverId.trim(), 
            voiceId: voiceId.trim(), 
            presence, 
            media, 
            activityText 
        }
    };

    return new Promise((resolve, reject) => {
        client.on('ready', async () => {
            logger.success(`${client.user.username} başarıyla bağlandı.`);
            
            const acts = media.stream ? [{ 
                name: activityText || 'Dave.903 Live', 
                type: 'STREAMING', 
                url: 'https://twitch.tv/dave903' 
            }] : [];
            
            client.user.setPresence({ status: presence || 'online', activities: acts });
            
            activeSessions.set(client.user.id, session);
            session.status = 'ready';

            // Initial Join
            await checkBotHealth(session);
            
            syncSystemAccounts();
            resolve(client.user.username);
        });

        client.on('voiceStateUpdate', (oldS, newS) => {
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
            }
        });

        client.on('disconnect', () => {
            logger.error(`${client.user?.username || 'Bilinmeyen'} bağlantısı kesildi.`);
            session.status = 'disconnected';
            syncSystemAccounts();
        });

        client.on('error', (err) => {
            logger.error(`Client Hatası (${client.user?.username || 'Token'}): ${err.message}`);
        });

        client.login(token).catch(err => {
            logger.error(`Login Hatası: ${err.message}`);
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

app.post('/api/logout-all', (req, res) => {
    activeSessions.forEach(s => {
        try { s.client.destroy(); } catch(e) {}
    });
    activeSessions.clear();
    syncSystemAccounts();
    logger.info("Tüm oturumlar kapatıldı.");
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

// --- WebSocket Events ---
io.on('connection', (s) => { 
    logger.info("Yeni bir dashboard bağlantısı.");
    syncSystemAccounts(); 
});

// --- Startup ---
server.listen(PORT, () => {
    console.clear();
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
    `);
});

