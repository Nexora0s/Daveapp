const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const { Client, Intents } = require('discord.js-selfbot-v13');
const { Server } = require('socket.io');
const http = require('http');
const path = require('path');
const fs = require('fs');
const ffmpeg = require('@ffmpeg-installer/ffmpeg');
const { Streamer } = require('@dank074/discord-video-stream');

// ====================== CONFIG ======================
const PORT = process.env.PORT || 3001;
const ALLOWED_ORIGINS = ['*']; 
process.env.FFMPEG_PATH = ffmpeg.path;

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: ALLOWED_ORIGINS, methods: ["GET", "POST"] } });

app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors({ origin: ALLOWED_ORIGINS, credentials: true }));
app.use(express.json());

const BANNER_PATH = path.join(__dirname, 'assets', 'stream_banner.png');
const CAFE_STATIC_PATH = path.join(__dirname, 'assets', 'cafe_static.png');
const activeSessions = new Map();

// ====================== SYNC ======================
const syncSystemAccounts = () => {
    const sessions = Array.from(activeSessions.values()).map(s => ({
        id: s.client.user?.id,
        username: s.client.user?.username,
        avatar: s.client.user?.displayAvatarURL(),
        isStreaming: !!s.isStreaming,
        isCamera: !!s.isCamera,
        token: s.token,
        config: s.config
    }));
    io.emit('sessionsUpdate', sessions);
};

// ====================== STREAMING CORE ======================
const startStream = async (session, guildId, channelId) => {
    try {
        if (!session.streamer) session.streamer = new Streamer(session.client);
        
        // 1. Ses kanalına bağlan
        await session.streamer.joinVoice(guildId, channelId);
        
        // 2. Kamera ve Yayın Sinyallerini Gönder
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

        // 3. UDP ve Yayın Oluştur
        const udp = await session.streamer.createStream();
        const asset = session.config.streamType === 'cafe' ? CAFE_STATIC_PATH : BANNER_PATH;
        
        session.streamer.playVideo(asset, udp);
        
        session.isStreaming = !!session.config.media.stream;
        session.isCamera = !!session.config.media.camera;
        
        syncSystemAccounts();
        console.log(`[BAŞARILI] ${session.client.user.username} yayına ve kameraya bağlandı.`);
    } catch (e) {
        console.error('[YAYIN HATASI]', e.message);
    }
};

const connectToken = async (data) => {
    const { token, serverId, voiceId, presence, media } = data;
    const client = new Client({
        checkUpdate: false,
        patchVoice: true,
        intents: new Intents(Intents.ALL),
        ws: { properties: { $os: 'Windows', $browser: 'Discord Client', $device: 'Discord Client' } }
    });

    return new Promise((resolve, reject) => {
        const timeout = setTimeout(() => { client.destroy(); reject(new Error('Bağlantı zaman aşımı.')); }, 30000);

        client.on('ready', async () => {
            clearTimeout(timeout);
            
            // Streaming status
            const acts = media.stream ? [{ name: 'Dave.903 Live', type: 'STREAMING', url: 'https://twitch.tv/dave903' }] : [];
            client.user.setPresence({ status: presence || 'online', activities: acts });
            
            const session = { 
                client, token, isStreaming: false, isCamera: false,
                config: { serverId, voiceId, media, streamType: 'banner' } 
            };
            activeSessions.set(client.user.id, session);

            if (media.stream || media.camera) {
                await startStream(session, serverId, voiceId);
            }

            syncSystemAccounts();
            resolve(client.user.username);
        });

        client.login(token).catch(reject);
    });
};

// ====================== ROUTES ======================
app.post('/api/connect', async (req, res) => {
    const { tokens, serverId: rS, voiceId: rV, presence, media } = req.body;
    const sId = rS?.trim(); const vId = rV?.trim();
    
    if (!tokens || !Array.isArray(tokens)) return res.status(400).json({ error: 'Token listesi hatalı' });

    for (const token of tokens) {
        try {
            await connectToken({ token: token.trim(), serverId: sId, voiceId: vId, presence, media });
        } catch (e) { console.error(`[BAGLANTI HATASI] ${e.message}`); }
    }
    res.json({ message: "İşlem tamamlandı (Arka planda bağlanılıyor)" });
});

app.post('/api/logout-all', (req, res) => {
    activeSessions.forEach(s => { try { s.client.destroy(); } catch(e){} });
    activeSessions.clear();
    syncSystemAccounts();
    res.json({ success: true });
});

io.on('connection', (s) => { syncSystemAccounts(); });

server.listen(PORT, () => {
    console.log(`🚀 Dave.903 Backend sunucusu ${PORT} portunda aktif.`);
});
