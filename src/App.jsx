import React, { useState, useEffect } from 'react';
import Header from './components/Header';
import Sidebar from './components/Sidebar';
import BotPanel from './components/BotPanel';
import StaffPanel from './components/StaffPanel';
import { io } from 'socket.io-client';
import './App.css';

const socket = io('http://localhost:3001');

function App() {
  const [sessions, setSessions] = useState([]);
  const [activeView, setActiveView] = useState('bot'); // 'bot' or 'staff'
  
  // Bot Connection States (Lifted for Sidebar access)
  const [token, setToken] = useState('');
  const [tokens, setTokens] = useState('');
  const [isBulk, setIsBulk] = useState(false);
  const [serverId, setServerId] = useState('');
  const [voiceId, setVoiceId] = useState('');
  const [presence, setPresence] = useState('online');
  const [activityText, setActivityText] = useState('');
  const [proxy, setProxy] = useState('');
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState({ current: 0, total: 0 });
  const [media, setMedia] = useState({ mic: false, sound: true, camera: true, stream: true });

  const getTokenList = () => {
    return isBulk 
      ? tokens.split('\n').map(t => t.trim()).filter(t => t)
      : [token.trim()].filter(t => t);
  };

  const handleConnect = async () => {
    const currentTokens = getTokenList();
    if (currentTokens.length === 0 || !serverId || !voiceId) {
      alert('Lütfen Token, Sunucu ID ve Ses ID alanlarını doldurun!');
      return;
    }

    setLoading(true);
    setProgress({ current: 0, total: currentTokens.length });
    
    try {
      const response = await fetch('http://localhost:3001/api/connect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          tokens: currentTokens, serverId, voiceId, presence, media, proxy, activityText,
          streamType: 'cafe'
        })
      });

      const data = await response.json();
      if (response.ok) {
        for (let i = 1; i <= currentTokens.length; i++) {
          setTimeout(() => setProgress(prev => ({ ...prev, current: i })), i * 2000);
        }
        setTimeout(() => {
          alert('✅ İşlem Tamamlandı: ' + data.message);
          setLoading(false);
          setProgress({ current: 0, total: 0 });
          // Clear inputs after success
          setToken('');
          setTokens('');
          setActivityText('');
          setProxy('');
          setServerId('');
          setVoiceId('');
        }, currentTokens.length * 2000 + 500);
      } else {
        alert('❌ Hata: ' + data.error);
        setLoading(false);
      }
    } catch (err) {
      alert('❌ Sunucuya bağlanılamadı. Backend çalışıyor mu?');
      setLoading(false);
    }
  };

  useEffect(() => {
    socket.on('sessionsUpdate', (data) => {
      console.log('Sessions updated:', data);
      setSessions(data);
    });

    return () => {
      socket.off('sessionsUpdate');
    };
  }, []);

  return (
    <div className="app-container">
      <Header />
      <div className="layout-grid">
        <main className="main-content">
          {activeView === 'bot' ? (
            <BotPanel 
              token={token} setToken={setToken}
              tokens={tokens} setTokens={setTokens}
              isBulk={isBulk} setIsBulk={setIsBulk}
              serverId={serverId} setServerId={setServerId}
              voiceId={voiceId} setVoiceId={setVoiceId}
              presence={presence} setPresence={setPresence}
              activityText={activityText} setActivityText={setActivityText}
              proxy={proxy} setProxy={setProxy}
              media={media} setMedia={setMedia}
              loading={loading} progress={progress}
              handleConnect={handleConnect}
            />
          ) : (
            <StaffPanel socket={socket} />
          )}
        </main>
        <Sidebar 
          sessions={sessions} 
          activeView={activeView} 
          setActiveView={setActiveView} 
        />
      </div>
      <footer className="footer-text">
        Dave.903 topluluğu için özenle geliştirildi
      </footer>
    </div>
  );
}

export default App;
