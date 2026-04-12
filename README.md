# DAVEAPP DEPLOYMENT KILAVUZU

## ⚠️ ÖNEMLİ: SENİN YAPMAN GEREKENLER

### 1️⃣ BACKEND (RENDER.COM) DEPLOY

**Adım 1:** Render.com → "New +" → "Web Service"

**Adım 2:** GitHub repo'yu bağla

**Adım 3:** Ayarlar:
```
Name: daveapp-backend
Root Directory: server
Build Command: npm install
Start Command: npm start
```

**Adım 4:** Environment Variables ekle:
```
NODE_ENV=production
PORT=10000
ALLOWED_ORIGINS=http://localhost:5173
```
(İlk deploy için localhost, sonra Vercel URL'i ekleyeceğiz)

**Adım 5:** "Create Web Service" → Deploy tamamlanana kadar bekle

**Adım 6:** Backend URL'i kopyala (örnek: `https://daveapp-backend-xyz.onrender.com`)

---

### 2️⃣ FRONTEND (VERCEL) DEPLOY

**Adım 1:** Vercel.com → "Add New Project"

**Adım 2:** GitHub repo'yu import et

**Adım 3:** Ayarlar:
```
Framework Preset: Vite
Build Command: npm run build
Output Directory: dist
Root Directory: ./ (ana klasör)
```

**Adım 4:** Environment Variables ekle:
```
VITE_BACKEND_URL=https://daveapp-backend-xyz.onrender.com
```
(Render'dan kopyaladığın backend URL'i buraya yapıştır!)

**Adım 5:** "Deploy" → Tamamlanana kadar bekle

**Adım 6:** Frontend URL'i kopyala (örnek: `https://daveapp-delta.vercel.app`)

---

### 3️⃣ BACKEND'DE CORS GÜNCELLEMESİ (ÇOK ÖNEMLİ!)

**Render'a geri dön:**

1. Dashboard → daveapp-backend → Environment
2. `ALLOWED_ORIGINS` değişkenini bul
3. Frontend URL'ini ekle:
   ```
   https://daveapp-delta.vercel.app
   ```
4. "Save Changes"
5. **Manuel Redeploy:** Settings → Manual Deploy → "Deploy latest commit"

---

## ✅ TEST

1. `https://daveapp-delta.vercel.app` adresini aç
2. Token/Sunucu/Ses bilgileri gir
3. "Sistemi Başlat / Bağlan" butonuna bas
4. Eğer backend bağlanamıyorsa tarayıcı Console'a bak (F12)

---

## 🐛 SORUN GİDERME

### "Backend'e bağlanılamadı!"
1. Render backend servisi çalışıyor mu? (dashboard'dan kontrol et)
2. Vercel'de `VITE_BACKEND_URL` doğru mu?
3. Render'da `ALLOWED_ORIGINS` doğru mu?
4. Tarayıcı Console'da CORS hatası var mı?

### "BAĞLANIYOR" ekranında takılı kalıyor
- Bu hata düzeltildi! Instant bağlanıyor artık.
- Eğer hala takılıyorsa backend çalışmıyor demektir.

### Backend 15 dakika sonra kapanıyor
- Render Free tier idle timeout'u var
- Health check endpoint var (`/health`) ama bu sadece otomatik restart için
- İlk istek 30 saniye gecikebilir (cold start)

---

## 📌 ÖNEMLİ NOTLAR

- **Render Free tier:** 15 dakika idle sonrası sleep mode
- **Vercel Free tier:** Her push otomatik deploy
- **Environment Variables değiştirdiysen:** Hem Vercel hem Render'da redeploy gerekir
- **CORS hatası:** `ALLOWED_ORIGINS` her iki URL'i de içermeli (frontend + localhost)

