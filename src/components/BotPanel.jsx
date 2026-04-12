import React, { useState } from 'react';
import { Eye, EyeOff, Mic, MicOff, Headphones, HeadphoneOff, Video, VideoOff, Monitor, MonitorOff, Zap } from 'lucide-react';

const BotPanel = ({
  token, setToken, tokens, setTokens, isBulk, setIsBulk,
  serverId, setServerId, voiceId, setVoiceId,
  presence, setPresence, activityText, setActivityText,
  proxy, setProxy, media, setMedia, loading, handleConnect
}) => {
  const [showToken, setShowToken] = useState(false);

  // ====================== BACKEND URL ======================
  const BACKEND_URL = import.meta.env.VITE_BACKEND_URL;

  if (!BACKEND_URL) {
    console.error('⚠️ VITE_BACKEND_URL tanımlanmamış! Vercel ayarlarından ekleyin.');
  }

  // ====================== HELPER FUNCTIONS ======================
  const getTokenList = () => {
    return isBulk
      ? tokens.split('\n').map(t => t.trim()).filter(t => t.length > 0)
      : [token.trim()].filter(t => t.length > 0);
  };

  const toggleMedia = async (key) => {
    if (!BACKEND_URL) return;

    const updatedMedia = { ...media, [key]: !media[key] };
    setMedia(updatedMedia);

    const tokenList = getTokenList();
    if (tokenList.length === 0 || loading) return;

    try {
      const response = await fetch(`${BACKEND_URL}/api/update-media`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tokens: tokenList, media: updatedMedia })
      });

      if (!response.ok) {
        console.warn(`Media update failed: ${response.status}`);
      }
    } catch (error) {
      console.error('Media update request failed:', error);
    }
  };

  return (
    <div className="bot-panel glass animate-fade-in" style={{ animationDelay: '0.1s' }}>
      <div className="top-header">
        <div className="security-badge">
          <span className="pulse"></span>
          DDoS Koruması Aktif (Safe v4)
        </div>
        <div className="mode-tabs glass">
          <button className={!isBulk ? 'active' : ''} onClick={() => setIsBulk(false)}>Tekli</button>
          <button className={isBulk ? 'active' : ''} onClick={() => setIsBulk(true)}>Toplu</button>
        </div>
      </div>

      {/* Token Input */}
      <section className="input-group">
        <label>{isBulk ? "Hesap Token'ları (Toplu)" : "Hesap Token'ı"}</label>
        <p className="description">
          {isBulk ? "Her satıra bir token gelecek şekilde yapıştırın" : "Bağlanacak hesabın token'ını girin"}
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
            <button className="toggle-visibility" onClick={() => setShowToken(!showToken)} type="button">
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
          <input type="text" placeholder="Sunucu ID yapıştırın..." className="glass-input"
            value={serverId} onChange={(e) => setServerId(e.target.value)} />
        </section>
        <section className="input-group">
          <label>Ses ID</label>
          <p className="description">Hedef ses kanalı ID</p>
          <input type="text" placeholder="Ses ID yapıştırın..." className="glass-input"
            value={voiceId} onChange={(e) => setVoiceId(e.target.value)} />
        </section>
      </div>

      {/* Presence */}
      <section className="input-group">
        <label>Görünürlük Durumu</label>
        <p className="description">Diğerlerine nasıl görüneceksiniz</p>
        <div className="presence-grid">
          {['online', 'idle', 'dnd', 'invisible'].map((status) => (
            <button key={status}
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
          <button className={`toggle-btn ${media.mic ? 'toggle-on' : 'toggle-off'}`} onClick={() => toggleMedia('mic')} type="button">
            <div className="toggle-icon-wrap">{media.mic ? <Mic size={22} /> : <MicOff size={22} />}</div>
            <div className="toggle-info">
              <span className="toggle-label">Mikrofon</span>
              <span className={`toggle-state ${media.mic ? 'on' : 'off'}`}>{media.mic ? '● AÇIK' : '○ KAPALI'}</span>
            </div>
            <div className={`toggle-indicator ${media.mic ? 'on' : 'off'}`}></div>
          </button>

          <button className={`toggle-btn ${media.sound ? 'toggle-on' : 'toggle-off'}`} onClick={() => toggleMedia('sound')} type="button">
            <div className="toggle-icon-wrap">{media.sound ? <Headphones size={22} /> : <HeadphoneOff size={22} />}</div>
            <div className="toggle-info">
              <span className="toggle-label">Kulaklık</span>
              <span className={`toggle-state ${media.sound ? 'on' : 'off'}`}>{media.sound ? '● AÇIK' : '○ KAPALI'}</span>
            </div>
            <div className={`toggle-indicator ${media.sound ? 'on' : 'off'}`}></div>
          </button>

          <button className={`toggle-btn ${media.camera ? 'toggle-on' : 'toggle-off'}`} onClick={() => toggleMedia('camera')} type="button">
            <div className="toggle-icon-wrap">{media.camera ? <Video size={22} /> : <VideoOff size={22} />}</div>
            <div className="toggle-info">
              <span className="toggle-label">Kamera</span>
              <span className={`toggle-state ${media.camera ? 'on' : 'off'}`}>{media.camera ? '● AÇIK' : '○ KAPALI'}</span>
            </div>
            <div className={`toggle-indicator ${media.camera ? 'on' : 'off'}`}></div>
          </button>

          <button className={`toggle-btn ${media.stream ? 'toggle-on' : 'toggle-off'}`} onClick={() => toggleMedia('stream')} type="button">
            <div className="toggle-icon-wrap">{media.stream ? <Monitor size={22} /> : <MonitorOff size={22} />}</div>
            <div className="toggle-info">
              <span className="toggle-label">Yayın</span>
              <span className={`toggle-state ${media.stream ? 'on' : 'off'}`}>{media.stream ? '● AÇIK' : '○ KAPALI'}</span>
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
          {loading ? 'Bağlanıyor...' : 'Sistemi Başlat / Bağlan'}
        </div>
        <div className="btn-glow"></div>
      </button>

      {/* Styles - Orijinal stil bloğu olduğu gibi */}
      <style dangerouslySetInnerHTML={{ __html: `
        .bot-panel { padding: 2.5rem; border-radius: 24px; display: flex; flex-direction: column; gap: 2rem; }
        .top-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.5rem; }
        .mode-tabs { display: flex; padding: 4px; border-radius: 10px; gap: 4px; }
        .mode-tabs button { padding: 6px 16px; border-radius: 8px; font-size: 0.8rem; font-weight: 600; color: var(--text-muted); cursor: pointer; transition: all 0.2s; border: none; background: transparent; }
        .mode-tabs button.active { background: var(--accent-gold); color: #000; }
        .input-group label { font-weight: 700; font-size: 1.1rem; display: block; margin-bottom: 2px; }
        .description { color: var(--text-muted); font-size: 0.85rem; margin-bottom: 1rem; }
        .glass-input { background: rgba(255, 255, 255, 0.03); border: 1px solid var(--card-border); padding: 12px 16px; border-radius: 12px; color: #fff; width: 100%; outline: none; transition: var(--transition); font-size: 0.95rem; }
        .glass-input:focus { border-color: var(--accent-gold); background: rgba(255, 255, 255, 0.05); }
        .bulk-textarea { min-height: 120px; resize: vertical; font-family: monospace; }
        .input-row { position: relative; }
        .toggle-visibility { position: absolute; right: 12px; top: 50%; transform: translateY(-50%); background: none; border: none; color: var(--text-muted); cursor: pointer; }
        .grid-row { display: grid; grid-template-columns: 1fr 1fr; gap: 2rem; }
        .presence-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; }
        .presence-btn { padding: 12px; border-radius: 12px; display: flex; align-items: center; gap: 10px; font-size: 0.85rem; color: var(--text-muted); transition: var(--transition); cursor: pointer; }
        .presence-btn.active { background: rgba(243, 156, 18, 0.05); border-color: var(--accent-gold); color: #fff; }
        .status-dot { width: 8px; height: 8px; border-radius: 50%; }
        .status-dot.online { background: #2ecc71; box-shadow: 0 0 8px #2ecc71; }
        .status-dot.idle { background: #f1c40f; box-shadow: 0 0 8px #f1c40f; }
        .status-dot.dnd { background: #e74c3c; box-shadow: 0 0 8px #e74c3c; }
        .status-dot.invisible { background: #95a5a6; box-shadow: 0 0 8px #95a5a6; }
        .media-toggle-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; }
        .toggle-btn { position: relative; display: flex; align-items: center; gap: 14px; padding: 18px 20px; border-radius: 16px; cursor: pointer; transition: all 0.25s cubic-bezier(0.4, 0, 0.2, 1); border: 2px solid transparent; overflow: hidden; }
        .toggle-btn.toggle-off { background: rgba(255, 255, 255, 0.03); border-color: rgba(255, 255, 255, 0.08); }
        .toggle-btn.toggle-off:hover { background: rgba(255, 255, 255, 0.06); border-color: rgba(255, 255, 255, 0.15); transform: translateY(-1px); }
        .toggle-btn.toggle-off .toggle-icon-wrap { background: rgba(255, 255, 255, 0.05); color: #666; }
        .toggle-btn.toggle-on { background: rgba(46, 204, 113, 0.08); border-color: rgba(46, 204, 113, 0.3); box-shadow: 0 4px 20px rgba(46, 204, 113, 0.1), inset 0 1px 0 rgba(46, 204, 113, 0.1); }
        .toggle-btn.toggle-on:hover { background: rgba(46, 204, 113, 0.12); border-color: rgba(46, 204, 113, 0.5); transform: translateY(-2px); box-shadow: 0 8px 30px rgba(46, 204, 113, 0.15); }
        .toggle-btn.toggle-on .toggle-icon-wrap { background: rgba(46, 204, 113, 0.15); color: #2ecc71; box-shadow: 0 0 12px rgba(46, 204, 113, 0.2); }
        .toggle-icon-wrap { width: 48px; height: 48px; border-radius: 14px; display: grid; place-items: center; transition: all 0.25s; flex-shrink: 0; }
        .toggle-info { display: flex; flex-direction: column; gap: 3px; text-align: left; }
        .toggle-label { font-size: 0.95rem; font-weight: 700; color: #fff; }
        .toggle-state { font-size: 0.72rem; font-weight: 800; letter-spacing: 1.5px; text-transform: uppercase; }
        .toggle-state.on { color: #2ecc71; }
        .toggle-state.off { color: #666; }
        .toggle-indicator { position: absolute; right: 16px; top: 50%; transform: translateY(-50%); width: 12px; height: 12px; border-radius: 50%; transition: all 0.25s; }
        .toggle-indicator.on { background: #2ecc71; box-shadow: 0 0 8px #2ecc71, 0 0 20px rgba(46, 204, 113, 0.3); }
        .toggle-indicator.off { background: #333; border: 2px solid #555; }
        .media-summary { margin-top: 12px; display: flex; gap: 8px; flex-wrap: wrap; }
        .summary-pill { font-size: 0.8rem; font-weight: 600; padding: 8px 16px; border-radius: 10px; }
        .summary-pill.cam { background: rgba(46, 204, 113, 0.1); color: #2ecc71; border: 1px solid rgba(46, 204, 113, 0.2); }
        .summary-pill.stream { background: rgba(52, 152, 219, 0.1); color: #3498db; border: 1px solid rgba(52, 152, 219, 0.2); }
        .security-badge { display: flex; align-items: center; gap: 10px; background: rgba(46, 204, 113, 0.1); color: #2ecc71; padding: 8px 16px; border-radius: 12px; font-size: 0.8rem; font-weight: 600; border: 1px solid rgba(46, 204, 113, 0.2); width: fit-content; }
        .pulse { width: 8px; height: 8px; background: #2ecc71; border-radius: 50%; box-shadow: 0 0 0 rgba(46, 204, 113, 0.4); animation: pulse 2s infinite; }
        @keyframes pulse { 0% { box-shadow: 0 0 0 0 rgba(46, 204, 113, 0.4); } 70% { box-shadow: 0 0 0 10px rgba(46, 204, 113, 0); } 100% { box-shadow: 0 0 0 0 rgba(46, 204, 113, 0); } }
      `}} />
    </div>
  );
};

export default BotPanel;
