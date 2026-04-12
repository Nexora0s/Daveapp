# Dave.903 - Profosyonel Discord AFK & Yetkili Takip Sistemi

**Dave.903**, Discord botlarınızı yönetmek, medya yayınları yapmak ve sunucunuzdaki yetkili performansını anlık olarak takip etmek için geliştirilmiş, premium bir yönetim panelidir.

![Dashboard Preview](https://api.dicebear.com/7.x/avataaars/svg?seed=Dave903)

## 🚀 Ana Özellikler

- **Gelişmiş Bot Kontrolü**: Tekli veya toplu olarak hesaplarınızı sese sokun.
- **Medya Akışı (Live Stream)**: FFmpeg altyapısı ile botlarınıza özel banner/video yayını yaptırın.
- **Yetkili Sayım Paneli (YSP)**: Sunucudaki yetkililerin ses sürelerini ve attığı mesajları anlık olarak takip edin.
- **Kalıcı Veri (Persistence)**: Tüm yetkili istatistikleri ve logları `staff_stats.json` dosyasında güvenle saklanır.
- **DDoS & Güvenlik**: Express rate-limit ve Helmet ile güçlendirilmiş güvenli API yapısı.
- **Auto-Reconnect**: Düşen botlar 5 saniye içinde otomatik olarak eski kanalına geri bağlanır.

## 🛠 Kurulum

1. **Bağımlılıkları Yükleyin**:
   ```bash
   npm install
   cd server
   npm install
   ```
2. **Sistemi Çalıştırın**:
   Kök dizindeki `run.bat` dosyasına çift tıklayın. Bu, hem Backend hem de Frontend'i otomatik olarak başlatacaktır.

## 📁 Dosya Yapısı

- `/server`: Node.js, Express ve Socket.io tabanlı ana sunucu.
- `/src`: React (Vite) tabanlı modern UI bileşenleri.
- `/server/data`: Yetkili verilerinin saklandığı JSON veritabanı.
- `/server/assets`: Medya yayınları için kullanılan görseller.

## 🖥 Sistem Gereksinimleri

- Node.js v16+
- FFmpeg (Sistemde yüklü olmalıdır, `run.bat` otomatik kontrol eder).
- Discord Hesap Token'ları.

---
*Geliştirici: Dave.903 Development Team*
*Sürüm: v4.0.0 Stable Build 2024.1*
