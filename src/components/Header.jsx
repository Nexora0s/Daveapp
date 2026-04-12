import React from 'react';
import { HelpCircle, Zap, Clock } from 'lucide-react';

const Header = () => {
  const [time, setTime] = React.useState(new Date().toLocaleTimeString('tr-TR'));

  React.useEffect(() => {
    const timer = setInterval(() => setTime(new Date().toLocaleTimeString('tr-TR')), 1000);
    return () => clearInterval(timer);
  }, []);

  return (
    <header className="header animate-fade-in">
      <div className="brand">
        <img src="/logo.png" alt="Dave.903 Logo" className="logo" />
        <div className="brand-text">
          <h1>Dave.903</h1>
          <p>Profosyonel AFK Yönetim Paneli</p>
        </div>
      </div>
      
      <div className="status-container">
        <div className="clock-display glass-pill">
          <span>{time}</span>
        </div>
        <div className="status-badge glass-pill">
          <span className="dot pulse"></span>
          Sistem Stabil
        </div>
        <button className="icon-btn glass">
          <HelpCircle size={18} />
        </button>
      </div>

      <style dangerouslySetInnerHTML={{ __html: `
        .header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 2rem; padding: 0.5rem 0; }
        .brand { display: flex; align-items: center; gap: 1.2rem; }
        .logo { width: 48px; height: 48px; border-radius: 14px; object-fit: cover; box-shadow: 0 8px 16px rgba(0,0,0,0.3), 0 0 20px rgba(243, 156, 18, 0.2); border: 1px solid rgba(255,255,255,0.1); }
        .brand-text h1 { font-size: 1.8rem; font-weight: 800; letter-spacing: -1px; background: linear-gradient(135deg, #fff 0%, #a0a0a0 100%); -webkit-background-clip: text; -webkit-text-fill-color: transparent; margin: 0; }
        .brand-text p { color: var(--text-muted); font-size: 0.8rem; margin: 0; opacity: 0.8; font-weight: 500; }
        .status-container { display: flex; align-items: center; gap: 0.8rem; }
        .clock-display { padding: 8px 16px; font-variant-numeric: tabular-nums; font-weight: 600; color: #fff; font-size: 0.9rem; background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.05); }
        .status-badge { display: flex; align-items: center; gap: 10px; font-size: 0.85rem; color: #2ecc71; font-weight: 600; background: rgba(46, 204, 113, 0.05); border: 1px solid rgba(46, 204, 113, 0.1); }
        .dot { width: 8px; height: 8px; background: #2ecc71; border-radius: 50%; box-shadow: 0 0 12px #2ecc71; position: relative; }
        .pulse { animation: pulse-ring 2s cubic-bezier(0.455, 0.03, 0.515, 0.955) infinite; }
        @keyframes pulse-ring {
          0% { transform: scale(0.8); box-shadow: 0 0 0 0 rgba(46, 204, 113, 0.7); }
          70% { transform: scale(1); box-shadow: 0 0 0 10px rgba(46, 204, 113, 0); }
          100% { transform: scale(0.8); box-shadow: 0 0 0 0 rgba(46, 204, 113, 0); }
        }
        .icon-btn { width: 44px; height: 44px; display: grid; place-items: center; cursor: pointer; transition: var(--transition); border-radius: 12px; background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.05); color: var(--text-muted); }
        .icon-btn:hover { background: rgba(255, 255, 255, 0.1); color: #fff; transform: translateY(-2px); border-color: rgba(255,255,255,0.2); }
      `}} />
    </header>
  );
};

export default Header;
