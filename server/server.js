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
process.env.FFMPEG_PATH = ffmpeg.path;

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*", methods: ["GET", "POST"] } });

app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors({ origin: "*" }));
app.use(express.json());

const BANNER_PATH = path.join(__dirname, 'assets', 'stream_banner.png');
const CAFE_STATIC_PATH = path.join(__dirname, 'assets', 'cafe_static.png');
const activeSessions = new Map();

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

// ====================== ULTIMATE STREAMING CORE ======================
const startStream = async (session, guildId, channelId) => {
    try {
        if (!session.streamer) session.streamer = new Streamer(session.client);
        
        console.log(`[SIGNAL] ${session.client.user.username} için yayın sinyalleri hazırlanıyor...`);

        // 1. Kanala giriş
        await session.streamer.joinVoice(guildId, channelId);
        
        // 2. Discord'a "Ben yayın açıyorum" sinyali gönder (OP 4 + Metadata)
        const streamOptions = {
            width: 1280,
            height: 720,
            fps: 30,
            bitrateKbps: 2500,
            maxBitrateKbps: 3000,
            videoCodec: 'H264'
        };

        // 3. UDP Oluştur
        const udp = await session.streamer.createStream(streamOptions);

        // 4. KRİTİK: Discord'un beklediği Fake Camera ve Go Live paketlerini manuel force et
        session.client.ws.send({
            op: 4,
            d: {
                guild_id: guildId,
                channel_id: channelId,
                self_mute: !!session.config?.media?.mic === false,
                self_deaf: !!session.config?.media?.sound === false,
                self_video: true, // Kamera ikonunu zorla aç
                self_stream: true // Yayın rozetini zorla aç
            }
        });

        // 5. Yayını teknik olarak başlat
        const asset = session.config.streamType === 'cafe' ? (fs.existsSync(CAFE_STATIC_PATH) ? CAFE_STATIC_PATH : BANNER_PATH) : BANNER_PATH;
        session.streamer.playVideo(asset, udp);
        
        session.isStreaming = true;
        session.isCamera = true;
        syncSystemAccounts();
        
        console.log(`[ULTIMATE-FIX] ✅ ${session.client.user.username} yayını başarıyla Discord'a yansıtıldı.`);
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
        client.on('ready', async () => {
            const acts = [{ 
                name: 'Dave.903 Live', 
                type: 'STREAMING', 
                url: 'https://twitch.tv/dave903' 
            }];
            
            client.user.setPresence({ status: presence || 'online', activities: acts });
            
            const session = { 
                client, token, isStreaming: false, isCamera: false,
                config: { serverId, voiceId, media, streamType: 'banner' } 
            };
            activeSessions.set(client.user.id, session);

            // KRİTİK: Bağlandıktan 3 saniye sonra, ses sunucusu tamamen hazır olduğunda yayını başlat
            setTimeout(() => {
                if (media.stream || media.camera) {
                    startStream(session, serverId, voiceId);
                }
            }, 3000);

            syncSystemAccounts();
            resolve(client.user.username);
        });

        client.login(token).catch(reject);
    });
};

// ====================== API ======================
app.post('/api/connect', async (req, res) => {
    const { tokens, serverId: rS, voiceId: rV, presence, media } = req.body;
    const sId = rS?.trim(); const vId = rV?.trim();
    
    for (const token of tokens) {
        if (!token) continue;
        connectToken({ token: token.trim(), serverId: sId, voiceId: vId, presence, media }).catch(console.error);
        await new Promise(r => setTimeout(r, 2000)); // Discord rate limit koruması
    }
    res.json({ message: "Sistem arka planda başlatıldı." });
});

app.post('/api/logout-all', (req, res) => {
    activeSessions.forEach(s => s.client.destroy());
    activeSessions.clear();
    syncSystemAccounts();
    res.json({ success: true });
});

io.on('connection', (s) => { syncSystemAccounts(); });

server.listen(PORT, () => {
    console.log(`🚀 Dave.903 ULTIMATE-FIX Sunucusu ${PORT} portunda aktif.`);
});
