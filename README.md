# DAVEAPP DEPLOYMENT KILAVUZU

## 1️⃣ BACKEND (RENDER.COM)

### Adım 1: Render'da Backend Deploy
1. Render.com'a giriş yap
2. "New +" → "Web Service" tıkla
3. GitHub repo'yu bağla
4. Root directory'yi **`server`** olarak ayarla
5. Build Command: `npm install`
6. Start Command: `npm start`
7. Environment Variables ekle:
   ```
   NODE_ENV=production
   PORT=10000
   ALLOWED_ORIGINS=https://daveapp-delta.vercel.app
   ```

### Adım 2: Backend URL'i Kopyala
Deploy tamamlandığında backend URL'i şuna benzer olacak:
```
https://daveapp-backend-XXXX.onrender.com
```
Bu URL'i kopyala!

---

## 2️⃣ FRONTEND (VERCEL)

### Adım 1: Vercel'de Frontend Deploy
1. Vercel.com'a giriş yap
2. "Add New Project" tıkla
3. GitHub repo'yu import et
4. Root Directory'yi **ana klasör** olarak bırak (varsayılan)
5. Framework Preset: **Vite** seç
6. Environment Variables ekle:
   ```
   VITE_BACKEND_URL=https://daveapp-backend-XXXX.onrender.com
   ```
   (Render'dan kopyaladığın backend URL'i buraya yapıştır!)

### Adım 2: Deploy Et
"Deploy" butonuna bas ve bekle.

---

## 3️⃣ CORS GÜNCELLEMESİ (ÖNEMLİ!)

Frontend deploy edildikten sonra Vercel URL'i şuna benzer olacak:
```
https://daveapp-delta.vercel.app
```

**Render'a geri dön ve ALLOWED_ORIGINS güncelle:**
1. Render dashboard → Backend servisini aç
2. Environment → `ALLOWED_ORIGINS` değişkenini düzenle
3. Frontend URL'ini ekle:
   ```
   https://daveapp-delta.vercel.app
   ```
4. Manuel Redeploy yap (Settings → Manual Deploy → Deploy Latest Commit)

---

## ✅ TEST

1. Frontend URL'ini tarayıcıda aç: `https://daveapp-delta.vercel.app`
2. Token girip bağlanmayı dene
3. Hata yoksa başarılı! 🎉

---

## 🐛 HATA ÇÖZÜMÜ

### "Sunucuya bağlanılamadı. Backend çalışıyor mu?"
- Render backend servisinin çalıştığından emin ol
- ALLOWED_ORIGINS doğru mu kontrol et
- Tarayıcı Console'da CORS hatası var mı bak

### "Health check failed"
- Render'da PORT=10000 ayarlı mı kontrol et
- Backend loglarını kontrol et

### WebSocket bağlantısı kopuyor
- Render Free tier'da idle timeout var (15 dakika)
- Health check endpoint'i aktif tutmalı: `/health`

---

## 📌 ÖNEMLİ NOTLAR

- **Render Free tier**: 15 dakika idle sonrası kapanır, ilk istek 30 saniye gecikir
- **Vercel Environment Variables**: Her değişiklikten sonra redeploy gerekir
- **CORS**: Backend ve Frontend URL'leri değiştiyse ALLOWED_ORIGINS güncellenmeli
