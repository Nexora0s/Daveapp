import React, { useState, useEffect } from 'react';
import { LayoutGrid, Users, ExternalLink, Mic, MicOff, Headphones, HeadphoneOff, Video, VideoOff, Monitor, MonitorOff, LogOut, Trash2, Play, Shield, Coffee, WifiOff } from 'lucide-react';

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || 'http://localhost:3001';

const UptimeTracker = ({ connectedAt }) => {
  const [uptime, setUptime] = useState('');

  useEffect(() => {
    if (!connectedAt) return;
    
    const calculate = () => {
      const diff = Date.now() - connectedAt;
      const hours = Math.floor(diff / 3600000);
      const mins = Math.floor((diff % 3600000) / 60000);
      if (hours > 0) return `${hours}s ${mins}dk`;
      if (mins === 0) return 'Az önce';
      return `${mins}dk`;
    };

    setUptime(calculate());
    const interval = setInterval(() => setUptime(calculate()), 60000);
    return () => clearInterval(interval);
  }, [connectedAt]);

  if (!connectedAt) return null;
  return <span className="uptime-badge">⏱ {uptime}</span>;
};

const Sidebar = ({ sessions = [], activeView = 'bot', setActiveView }) => {
  const handleLogout = async (userId) => {
    try {
      const resp = await fetch(`${BACKEND_URL}/api/logout`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId })
      });
      if (resp.ok) {
        // Socket update will handle the UI
      }
    } catch (e) {
      console.error('Logout error:', e);
    }
  };

  const handleLogoutAll = async () => {
    if (!window.confirm('Tüm oturumları kapatmak istediğinize emin misiniz?')) return;
    try {
      await fetch(`${BACKEND_URL}/api/logout-all`, { method: 'POST' });
    } catch (e) {
      console.error('Logout all error:', e);
    }
  };

  const handleToggleMedia = async (userId, key) => {
    const user = sessions.find(s => s.id === userId);
    if (!user) return;

    const currentMedia = user.config?.media || { mic: false, sound: true, camera: false, stream: false };
    const updatedMedia = { ...currentMedia, [key]: !currentMedia[key] };

    try {
      await fetch(`${BACKEND_URL}/api/update-media`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tokens: [user.token], media: updatedMedia })
      });
    } catch (e) {
      console.error('Sidebar media toggle error:', e);
    }
  };

  const voiceSessions = sessions.filter(s => s.isSeste);

  return (
    <aside className="sidebar animate-fade-in" style={{ animationDelay: '0.2s' }}>
      <div className="nav-tabs glass">
        <button 
          className={`nav-item ${activeView === 'bot' ? 'active' : ''}`}
          onClick={() => setActiveView('bot')}
        >
          <LayoutGrid size={18} />
          <span>Bot Kontrol</span>
        </button>
        <button 
          className={`nav-item ${activeView === 'staff' ? 'active' : ''}`}
          onClick={() => setActiveView('staff')}
        >
          <Users size={18} />
          <span>Yetkili Sayım</span>
        </button>
      </div>

      <div className="profile-card glass">
        <div className="profile-header">
          <img src="/logo.png" alt="Dave" className="profile-img" />
          <div className="profile-info">
            <h3>Dave.903</h3>
            <p>dave.903.online</p>
          </div>
          <button className="visit-btn glass">
            Ziyaret Et <ExternalLink size={14} />
          </button>
        </div>
      </div>

      <div className="stats-card">
        <div className="stats-row">
            <div className="stat-item">
                <h2>{sessions.length}</h2>
                <p>TOPLAM HESAP</p>
            </div>
            <div className="stat-separator"></div>
            <div className="stat-item">
                <h2 className={voiceSessions.length > 0 ? "active-text" : ""}>{voiceSessions.length}</h2>
                <p>SESTE AKTİF</p>
            </div>
        </div>
      </div>


      <div className="active-sessions">
        <div className="section-header">
          <div className="header-left">
            <h3>Sisteme Bağlı Hesaplar</h3>
            <span className="live-pill glass-pill">● Aktif</span>
          </div>
          {sessions.length > 0 && (
            <button className="logout-all-btn glass" onClick={handleLogoutAll} title="Tümünü Kapat">
              <Trash2 size={16} color="var(--status-dnd)" />
            </button>
          )}
        </div>
        
        {/* Connection status placeholder when empty */}
        {sessions.length === 0 && (
          <div className="system-idle-badge glass">
            <Shield size={24} color="var(--accent-gold)" style={{ opacity: 0.3 }} />
            <div className="idle-meta">
                <h4>Sistem Hazır</h4>
                <p>Oturum açmak için ana paneli kullanın</p>
            </div>
          </div>
        )}

        <div className="session-list">
          {sessions.length === 0 ? (
            <p className="empty-message">
              Henüz kimse bağlı değil.
            </p>
          ) : (
            sessions.map((user) => (
              <div key={user.id} className={`user-session glass animate-slide-in ${user.config?.cafeMode ? 'cafe-session' : ''}`}>
                <div className="user-row">
                  <div className="avatar-wrapper">
                    <img 
                      src={user.avatar || `https://api.dicebear.com/7.x/avataaars/svg?seed=${user.username}`} 
                      alt="Avatar" 
                      className="avatar" 
                    />
                    <span className={`online-dot ${user.status}`}></span>
                  </div>
                  <div className="user-details">
                    <h4 style={{ display: 'flex', alignItems: 'center' }}>
                      {user.displayName || user.username}
                      <UptimeTracker connectedAt={user.connectedAt} />
                    </h4>
                    <p className="status-text">
                      {user.config?.cafeMode ? (
                        <>
                          <span className="cafe-dot-small"></span>
                          Kafe Kamera 24/7
                        </>
                      ) : (
                        <>
                          <span className="live-dot-small"></span>
                          {user.config?.media?.stream ? 'Yayında' : 'Seste Aktif'}
                        </>
                      )}
                    </p>
                  </div>
                  {user.config?.cafeMode && (
                    <div className="cafe-mode-pill">
                      <Coffee size={11} />
                      <span>KAFE</span>
                    </div>
                  )}
                  <button className="logout-btn glass" onClick={() => handleLogout(user.id)} title="Oturumu Kapat">
                    <LogOut size={14} />
                  </button>
                </div>
                <div className="action-buttons">
                  <button 
                    className={`action-btn glass ${user.config?.media?.mic ? 'active' : ''}`}
                    onClick={() => handleToggleMedia(user.id, 'mic')}
                    title={user.config?.media?.mic ? "Mikrofon Açık" : "Mikrofon Kapalı"}
                  >
                    {user.config?.media?.mic ? <Mic size={16} /> : <MicOff size={16} />}
                  </button>
                  <button 
                    className={`action-btn glass ${user.config?.media?.sound ? 'active' : ''}`}
                    onClick={() => handleToggleMedia(user.id, 'sound')}
                    title={user.config?.media?.sound ? "Kulaklık Açık" : "Kulaklık Kapalı"}
                  >
                    {user.config?.media?.sound ? <Headphones size={16} /> : <HeadphoneOff size={16} />}
                  </button>
                  <button 
                    className={`action-btn glass ${user.config?.media?.camera ? 'active' : ''}`}
                    onClick={() => handleToggleMedia(user.id, 'camera')}
                    title={user.config?.media?.camera ? "Kamera Açık" : "Kamera Kapalı"}
                  >
                    {user.config?.media?.camera ? <Video size={16} /> : <VideoOff size={16} />}
                  </button>
                  <button 
                    className={`action-btn glass ${user.config?.media?.stream ? 'active' : ''}`}
                    onClick={() => handleToggleMedia(user.id, 'stream')}
                    title={user.config?.media?.stream ? "Yayın Açık" : "Yayın Kapalı"}
                  >
                    {user.config?.media?.stream ? <Monitor size={16} /> : <MonitorOff size={16} />}
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      <div className="sidebar-footer glass">
        <div className="version-info">
            <span className="version-pill">v4.0.0 Stable</span>
            <span className="build-no">Build 2024.1.Rel</span>
        </div>
        <div className="support-badge glass-pill">
            <Shield size={12} />
            <span>Premium Destek</span>
        </div>
      </div>

      <style dangerouslySetInnerHTML={{ __html: `
        .sidebar { display: flex; flex-direction: column; gap: 1.5rem; }
        
        .nav-tabs { display: flex; padding: 6px; border-radius: 16px; gap: 6px; }
        .nav-item { flex: 1; display: flex; align-items: center; justify-content: center; gap: 10px; padding: 10px; border: none; background: transparent; color: var(--text-muted); font-weight: 600; font-size: 0.85rem; cursor: pointer; transition: var(--transition); border-radius: 12px; }
        .nav-item:hover { background: rgba(255,255,255,0.03); color: #fff; }
        .nav-item.active { background: var(--accent-gold); color: #000; }
        .nav-item.active svg { color: #000; }

        .profile-card { padding: 1.5rem; border-radius: 20px; }
        .profile-header { display: flex; align-items: center; gap: 1rem; position: relative; }
        .profile-img { width: 48px; height: 48px; border-radius: 12px; object-fit: cover; }
        .profile-info h3 { font-size: 1.1rem; margin: 0; }
        .profile-info p { font-size: 0.8rem; color: var(--text-muted); }
        .visit-btn { margin-left: auto; display: flex; align-items: center; gap: 6px; padding: 6px 12px; font-size: 0.75rem; color: var(--accent-gold); border: 1px solid var(--accent-gold); background: rgba(243, 156, 18, 0.1); }
        .stats-card { padding: 1rem; border-radius: 20px; background: rgba(255,255,255,0.02); border: 1px solid rgba(255,255,255,0.05); }
        .stats-row { display: flex; align-items: center; justify-content: space-around; text-align: center; }
        .stat-item h2 { font-size: 2rem; font-weight: 800; line-height: 1; color: var(--accent-gold); margin-bottom: 4px; }
        .stat-item h2.active-text { color: #2ecc71; text-shadow: 0 0 15px rgba(46, 204, 113, 0.3); }
        .stat-item p { font-size: 0.65rem; letter-spacing: 1.5px; color: var(--text-muted); font-weight: 700; }
        .stat-separator { width: 1px; height: 30px; background: rgba(255,255,255,0.1); }

        .system-idle-badge { 
          display: flex; align-items: center; gap: 15px; padding: 1.5rem; 
          border-radius: 16px; background: rgba(243, 156, 18, 0.03); 
          border: 1px dashed rgba(243, 156, 18, 0.2); margin-top: 1rem;
        }
        .idle-meta h4 { font-size: 0.9rem; color: #fff; margin: 0; }
        .idle-meta p { font-size: 0.75rem; color: var(--text-muted); margin: 4px 0 0 0; }

        .active-sessions { display: flex; flex-direction: column; gap: 1rem; margin-top: 1.5rem; }
        .session-list { display: flex; flex-direction: column; gap: 1rem; max-height: 500px; overflow-y: auto; padding-right: 4px; }
        .section-header { display: flex; justify-content: space-between; align-items: center; }
        .header-left { display: flex; align-items: center; gap: 10px; }
        .section-header h3 { font-size: 1rem; font-weight: 600; }
        .live-pill { font-size: 0.7rem; color: #2ecc71; background: rgba(46, 204, 113, 0.1); }
        .subtitle { font-size: 0.8rem; color: var(--text-muted); margin-bottom: 0.5rem; }

        .user-session { padding: 1.2rem; border-radius: 16px; display: flex; flex-direction: column; gap: 1rem; border-left: 3px solid var(--accent-gold); transition: transform 0.2s ease; }
        .user-session:hover { transform: translateX(5px); }
        .user-row { display: flex; align-items: center; gap: 1rem; }
        .avatar-wrapper { position: relative; }
        .avatar { width: 44px; height: 44px; border-radius: 50%; background: #333; border: 2px solid rgba(255, 255, 255, 0.1); }
        .online-dot { width: 12px; height: 12px; border: 2px solid var(--bg-color); border-radius: 50%; position: absolute; bottom: 2px; right: 2px; }
        .online-dot.online { background: #2ecc71; }
        .online-dot.idle { background: #f1c40f; }
        .online-dot.dnd { background: #e74c3c; }
        .online-dot.offline { background: #95a5a6; }

        .uptime-badge { font-size: 0.65rem; background: rgba(255,255,255,0.05); padding: 2px 6px; border-radius: 6px; color: var(--text-muted); margin-left: 8px; border: 1px solid rgba(255,255,255,0.08); display: flex; align-items: center; justify-content: center; font-weight: normal; }

        .user-details h4 { font-size: 0.95rem; margin: 0; }
        .status-text { font-size: 0.75rem; color: var(--text-muted); display: flex; gap: 4px; align-items: center; margin-top: 2px; }
        .logout-btn { margin-left: auto; width: 32px; height: 32px; padding: 0; display: grid; place-items: center; border-radius: 8px; color: var(--status-dnd); background: rgba(231, 76, 60, 0.05); }
        .logout-btn:hover { background: rgba(231, 76, 60, 0.2); }
        .logout-all-btn { width: 36px; height: 36px; display: grid; place-items: center; border-radius: 8px; }

        .live-dot-small { width: 6px; height: 6px; background: #2ecc71; border-radius: 50%; box-shadow: 0 0 8px #2ecc71; animation: pulse-blink 1.5s infinite; flex-shrink: 0; }
        @keyframes pulse-blink { 0% { opacity: 0.4; } 50% { opacity: 1; } 100% { opacity: 0.4; } }

        .action-buttons { display: flex; gap: 8px; margin-top: 4px; }
        .action-btn { flex: 1; height: 38px; display: grid; place-items: center; border-radius: 12px; color: var(--text-muted); background: rgba(255,255,255,0.03); border: 1px solid var(--card-border); transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1); cursor: pointer; }
        .action-btn:hover { background: rgba(255,255,255,0.08); border-color: rgba(255,255,255,0.2); transform: translateY(-1px); }
        .action-btn.active { color: #000; background: var(--accent-gold); border-color: var(--accent-gold); box-shadow: 0 4px 12px rgba(243, 156, 18, 0.2); }
        .action-btn.active svg { filter: drop-shadow(0 0 2px rgba(0,0,0,0.5)); }
        
        .empty-message { color: var(--text-muted); font-size: 0.9rem; text-align: center; padding: 1.5rem; border: 1px dashed var(--card-border); border-radius: 12px; }
        
        .sidebar-footer { margin-top: auto; padding: 1.5rem; border-radius: 24px; display: flex; flex-direction: column; gap: 12px; background: rgba(243, 156, 18, 0.03); border: 1px solid rgba(243, 156, 18, 0.1); }
        .version-info { display: flex; flex-direction: column; gap: 4px; }
        .version-pill { font-size: 0.8rem; font-weight: 700; color: #fff; background: rgba(255,255,255,0.05); padding: 4px 12px; border-radius: 8px; width: fit-content; border: 1px solid rgba(255,255,255,0.1); }
        .build-no { font-size: 0.65rem; color: var(--text-muted); opacity: 0.6; letter-spacing: 1px; }
        .support-badge { display: flex; align-items: center; gap: 8px; font-size: 0.75rem; color: var(--accent-gold); font-weight: 600; padding: 8px 16px; border: 1px solid rgba(243, 156, 18, 0.2); }

        /* Cafe Mode Session Styles */
        .cafe-session { border-left: 3px solid #00ff88 !important; background: rgba(0, 255, 136, 0.02); }
        .cafe-session:hover { box-shadow: 0 4px 20px rgba(0, 255, 136, 0.05); }
        .cafe-dot-small { 
          width: 6px; height: 6px; background: #00ff88; border-radius: 50%; 
          box-shadow: 0 0 8px #00ff88; animation: pulse-blink 1.5s infinite; flex-shrink: 0; 
        }
        .cafe-mode-pill { 
          display: flex; align-items: center; gap: 4px; 
          background: rgba(0, 255, 136, 0.1); color: #00ff88; 
          font-size: 0.6rem; font-weight: 800; padding: 3px 8px; 
          border-radius: 6px; border: 1px solid rgba(0, 255, 136, 0.25); 
          letter-spacing: 1.5px; margin-left: auto; margin-right: 8px;
          text-shadow: 0 0 6px rgba(0, 255, 136, 0.3);
          animation: cafePulse 2s ease-in-out infinite;
        }
        @keyframes cafePulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.7; }
        }
      `}} />
    </aside>
  );
};

export default Sidebar;
