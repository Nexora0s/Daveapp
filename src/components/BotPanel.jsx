import React, { useState } from 'react';
import { Eye, EyeOff, Mic, MicOff, Headphones, HeadphoneOff, Video, VideoOff, Monitor, MonitorOff, Zap } from 'lucide-react';

const BotPanel = ({
  token, setToken, tokens, setTokens, isBulk, setIsBulk,
  serverId, setServerId, voiceId, setVoiceId,
  presence, setPresence, activityText, setActivityText,
  proxy, setProxy, media, setMedia, loading, progress, handleConnect
}) => {
  const [showToken, setShowToken] = useState(false);

  // ====================== BACKEND URL (Production Ready) ======================
  const BACKEND_URL = import.meta.env.VITE_BACKEND_URL;

  // Eğer VITE_BACKEND_URL tanımlanmamışsa hata versin (güvenlik için)
  if (!BACKEND_URL) {
    console.error('❌ VITE_BACKEND_URL environment variable tanımlanmamış!');
  }

  // ====================== HELPER FUNCTIONS ======================
  const getTokenList = () => {
    return isBulk
      ? tokens.split('\n').map(t => t.trim()).filter(t => t.length > 0)
      : [token.trim()].filter(t => t.length > 0);
  };

  // Media toggle
  const toggleMedia = async (key) => {
    const updatedMedia = { ...media, [key]: !media[key] };
    setMedia(updatedMedia);

    const tokenList = getTokenList();
    if (tokenList.length === 0 || loading || !BACKEND_URL) return;

    try {
      const response = await fetch(`${BACKEND_URL}/api/update-media`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tokens: tokenList,
          media: updatedMedia
        }),
      });

      if (!response.ok) {
        console.warn(`Media update failed: ${response.status}`);
      }
    } catch (error) {
      console.error('Media update request failed:', error);
    }
  };

  // ====================== RENDER ======================
  return (
    <div className="bot-panel glass animate-fade-in" style={{ animationDelay: '0.1s' }}>
      <div className="top-header">
        <div className="security-badge">
          <span className="pulse"></span>
          DDoS Koruması Aktif (Safe v4)
        </div>
        <div className="mode-tabs glass">
          <button className={!isBulk ? 'active' : ''} onClick={() => setIsBulk(false)}>
            Tekli
          </button>
          <button className={isBulk ? 'active' : ''} onClick={() => setIsBulk(true)}>
            Toplu
          </button>
        </div>
      </div>

      {/* Token Input */}
      <section className="input-group">
        <label>{isBulk ? "Hesap Token'ları (Toplu)" : "Hesap Token'ı"}</label>
        <p className="description">
          {isBulk 
            ? "Her satıra bir token gelecek şekilde yapıştırın" 
            : "Bağlanacak hesabın token'ını girin"}
        </p>
        
        {isBulk ? (
          <textarea
            placeholder={"Token1\nToken2\n..."}
            className="glass-input bulk-textarea"
            value={tokens}
            onChange={(e) => setTokens(e.target.value)}
            rows={4}
          />
        ) : (
          <div className="input-row">
            <input
              type={showToken ? 'text' : 'password'}
              placeholder="Token'ınızı buraya yapıştırın..."
              className="glass-input"
              value={token}
              onChange={(e) => setToken(e.target.value)}
            />
            <button 
              className="toggle-visibility" 
              onClick={() => setShowToken(!showToken)}
              type="button"
            >
              {showToken ? <EyeOff size={18} /> : <Eye size={18} />}
            </button>
          </div>
        )}
      </section>

      {/* Activity Text */}
      <section className="input-group">
        <label>Aktivite Yazısı (Opsiyonel)</label>
        <p className="description">Botların profilinde ne yazdığını belirleyin</p>
        <input
          type="text"
          placeholder="Oynuyor: Dave.903 Dashboard"
          className="glass-input"
          value={activityText}
          onChange={(e) => setActivityText(e.target.value)}
        />
      </section>

      {/* Proxy */}
      <section className="input-group">
        <label>Proxy (Opsiyonel)</label>
        <p className="description">Format: http://user:pass@ip:port</p>
        <input
          type="text"
          placeholder="Proxy yapıştırın..."
          className="glass-input"
          value={proxy}
          onChange={(e) => setProxy(e.target.value)}
        />
      </section>

      {/* Server & Voice IDs */}
      <div className="grid-row">
        <section className="input-group">
          <label>Sunucu ID</label>
          <p className="description">Hedef sunucu (guild) ID</p>
          <input 
            type="text" 
            placeholder="Sunucu ID yapıştırın..." 
            className="glass-input"
            value={serverId} 
            onChange={(e) => setServerId(e.target.value)} 
          />
        </section>
        <section className="input-group">
          <label>Ses ID</label>
          <p className="description">Hedef ses kanalı ID</p>
          <input 
            type="text" 
            placeholder="Ses ID yapıştırın..." 
            className="glass-input"
            value={voiceId} 
            onChange={(e) => setVoiceId(e.target.value)} 
          />
        </section>
      </div>

      {/* Presence */}
      <section className="input-group">
        <label>Görünürlük Durumu</label>
        <p className="description">Diğerlerine nasıl görüneceksiniz</p>
        <div className="presence-grid">
          {['online', 'idle', 'dnd', 'invisible'].map((status) => (
            <button 
              key={status}
              className={`presence-btn glass ${presence === status ? 'active' : ''}`}
              onClick={() => setPresence(status)}
              type="button"
            >
              <span className={`status-dot ${status}`}></span>
              {status === 'online' && 'Çevrimiçi'}
              {status === 'idle' && 'Boşta'}
              {status === 'dnd' && 'Rahatsız Etme'}
              {status === 'invisible' && 'Görünmez'}
            </button>
          ))}
        </div>
      </section>

      {/* Media Toggle Buttons */}
      <section className="input-group">
        <label>Medya Kontrolleri</label>
        <p className="description">Açmak/kapatmak için butona basın — her hesap için aynı anda çalışır</p>
        
        <div className="media-toggle-grid">
          {/* Mikrofon */}
          <button
            className={`toggle-btn ${media.mic ? 'toggle-on' : 'toggle-off'}`}
            onClick={() => toggleMedia('mic')}
            type="button"
          >
            <div className="toggle-icon-wrap">
              {media.mic ? <Mic size={22} /> : <MicOff size={22} />}
            </div>
            <div className="toggle-info">
              <span className="toggle-label">Mikrofon</span>
              <span className={`toggle-state ${media.mic ? 'on' : 'off'}`}>
                {media.mic ? '● AÇIK' : '○ KAPALI'}
              </span>
            </div>
            <div className={`toggle-indicator ${media.mic ? 'on' : 'off'}`}></div>
          </button>

          {/* Kulaklık */}
          <button
            className={`toggle-btn ${media.sound ? 'toggle-on' : 'toggle-off'}`}
            onClick={() => toggleMedia('sound')}
            type="button"
          >
            <div className="toggle-icon-wrap">
              {media.sound ? <Headphones size={22} /> : <HeadphoneOff size={22} />}
            </div>
            <div className="toggle-info">
              <span className="toggle-label">Kulaklık</span>
              <span className={`toggle-state ${media.sound ? 'on' : 'off'}`}>
                {media.sound ? '● AÇIK' : '○ KAPALI'}
              </span>
            </div>
            <div className={`toggle-indicator ${media.sound ? 'on' : 'off'}`}></div>
          </button>

          {/* Kamera */}
          <button
            className={`toggle-btn ${media.camera ? 'toggle-on' : 'toggle-off'}`}
            onClick={() => toggleMedia('camera')}
            type="button"
          >
            <div className="toggle-icon-wrap">
              {media.camera ? <Video size={22} /> : <VideoOff size={22} />}
            </div>
            <div className="toggle-info">
              <span className="toggle-label">Kamera</span>
              <span className={`toggle-state ${media.camera ? 'on' : 'off'}`}>
                {media.camera ? '● AÇIK' : '○ KAPALI'}
              </span>
            </div>
            <div className={`toggle-indicator ${media.camera ? 'on' : 'off'}`}></div>
          </button>

          {/* Yayın */}
          <button
            className={`toggle-btn ${media.stream ? 'toggle-on' : 'toggle-off'}`}
            onClick={() => toggleMedia('stream')}
            type="button"
          >
            <div className="toggle-icon-wrap">
              {media.stream ? <Monitor size={22} /> : <MonitorOff size={22} />}
            </div>
            <div className="toggle-info">
              <span className="toggle-label">Yayın</span>
              <span className={`toggle-state ${media.stream ? 'on' : 'off'}`}>
                {media.stream ? '● AÇIK' : '○ KAPALI'}
              </span>
            </div>
            <div className={`toggle-indicator ${media.stream ? 'on' : 'off'}`}></div>
          </button>
        </div>

        {(media.camera || media.stream) && (
          <div className="media-summary">
            {media.camera && <span className="summary-pill cam">📷 Sadece Kamera aktif</span>}
            {media.stream && <span className="summary-pill stream">📺 Sadece Yayın aktif</span>}
          </div>
        )}
      </section>

      {/* Connect Button */}
      <button
        className={`connect-btn premium-btn ${loading ? 'loading' : ''}`}
        onClick={handleConnect}
        disabled={loading}
        type="button"
      >
        <div className="btn-content">
          <Zap size={20} fill="currentColor" />
          {loading
            ? (progress.total > 0 ? `Bağlanıyor (${progress.current}/${progress.total})` : 'Bağlanıyor...')
            : 'Sistemi Başlat / Bağlan'}
        </div>
        <div className="btn-glow"></div>
      </button>

      {/* Styles - orijinal stil bloğunu buraya olduğu gibi yapıştır (kısalttım) */}
      <style dangerouslySetInnerHTML={{ __html: ` 
        /* Buraya orijinal <style> içindeki tüm CSS kodunu olduğu gibi yapıştır */
        /* ... (senin önceki kodundaki style bloğunun tamamı) ... */
      ` }} />
    </div>
  );
};

export default BotPanel;
