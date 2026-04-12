import React, { useState, useEffect, useMemo } from 'react';
import { Users, Mic, Clock, Shield, Zap, Search, MoreHorizontal, MessageSquare, Activity } from 'lucide-react';

// Optimized Sub-component for Staff Row
const StaffRow = React.memo(({ staff }) => (
    <tr className="staff-row">
        <td>
            <div className="user-cell">
                <div className="avatar-small">
                    <img src={`https://api.dicebear.com/7.x/avataaars/svg?seed=${staff.name}`} alt="" />
                    <span className={`status-indicator ${staff.status}`}></span>
                </div>
                <span>{staff.name}</span>
            </div>
        </td>
        <td><span className="role-badge">{staff.role}</span></td>
        <td>
            <span className={`status-text ${staff.isAFK ? 'afk' : 'active'}`}>
                {staff.isAFK ? '● AFK' : '● Aktif'}
            </span>
        </td>
        <td><span className="message-count">{staff.messageCount || 0}</span></td>
        <td><span className="channel-text">{staff.channel || '-'}</span></td>
        <td><span className="time-text">{staff.voiceTime}</span></td>
        <td>
            <button className="action-dot">
                <MoreHorizontal size={18} />
            </button>
        </td>
    </tr>
));

const StaffPanel = ({ socket }) => {
    const [searchTerm, setSearchTerm] = useState('');
    const [staffData, setStaffData] = useState([]);
    const [logs, setLogs] = useState([]);

    useEffect(() => {
        if (!socket) return;

        const handleUpdate = (data) => {
            if (data.staff) setStaffData(data.staff);
            if (data.logs) setLogs(data.logs);
        };

        socket.on('staffUpdate', handleUpdate);
        return () => {
            socket.off('staffUpdate');
        };
    }, [socket]);

    const stats = useMemo(() => ({
        total: staffData.length,
        active: staffData.filter(s => s.channel && !s.isAFK).length,
        afk: staffData.filter(s => s.isAFK).length
    }), [staffData]);

    const filteredStaff = useMemo(() => {
        return staffData.filter(s => 
            s.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
            s.role.toLowerCase().includes(searchTerm.toLowerCase())
        );
    }, [staffData, searchTerm]);

    return (
        <div className="staff-panel animate-fade-in">
            {/* Header Stats */}
            <div className="stats-header-grid">
                <div className="stat-card glass">
                    <div className="stat-icon users"><Users size={24} /></div>
                    <div className="stat-info">
                        <h3>{stats.total}</h3>
                        <p>Toplam Yetkili</p>
                    </div>
                </div>
                <div className="stat-card glass">
                    <div className="stat-icon active"><Zap size={24} /></div>
                    <div className="stat-info">
                        <h3>{stats.active}</h3>
                        <p>Seste Aktif</p>
                    </div>
                </div>
                <div className="stat-card glass">
                    <div className="stat-icon afk"><Clock size={24} /></div>
                    <div className="stat-info">
                        <h3>{stats.afk}</h3>
                        <p>AFK Durumda</p>
                    </div>
                </div>
            </div>

            <div className="panel-layout">
                {/* Main Staff List */}
                <div className="main-section glass">
                    <div className="section-header">
                        <div className="header-title">
                            <Shield size={20} className="accent-text" />
                            <h2>Yetkili <span className="accent-text">Sayım Listesi</span></h2>
                        </div>
                        <div className="live-pulse">
                            <span className="pulse-dot-small"></span>
                            CANLI TAKİP
                        </div>
                        <div className="header-actions">
                            <div className="search-box glass">
                                <Search size={16} />
                                <input 
                                    type="text" 
                                    placeholder="Yetkili ara..." 
                                    value={searchTerm}
                                    onChange={(e) => setSearchTerm(e.target.value)}
                                />
                            </div>
                        </div>
                    </div>

                    <div className="table-container">
                        <table className="staff-table">
                            <thead>
                                <tr>
                                    <th>YETKİLİ</th>
                                    <th>ROL</th>
                                    <th>DURUM</th>
                                    <th>MESAJ</th>
                                    <th>KANAL</th>
                                    <th>SES SÜRESİ</th>
                                    <th></th>
                                </tr>
                            </thead>
                            <tbody>
                                {filteredStaff.map(staff => (
                                    <StaffRow key={staff.id} staff={staff} />
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>

                {/* Side Activity Logs */}
                <div className="activity-section glass">
                    <div className="section-header">
                        <div className="header-title">
                            <Activity size={20} className="accent-text" />
                            <h2>Son Aktiviteler</h2>
                        </div>
                    </div>
                    <div className="logs-list">
                        {logs.map(log => (
                            <div key={log.id} className="log-item">
                                <div className={`log-indicator ${log.type}`}></div>
                                <div className="log-content">
                                    <p>
                                        <strong>{log.user}</strong> 
                                        {log.type === 'join' && ` ${log.channel} kanalına katıldı.`}
                                        {log.type === 'move' && ` ${log.from} -> ${log.to} kanalına taşındı.`}
                                        {log.type === 'leave' && ` ${log.channel} kanalından ayrıldı.`}
                                        {log.type === 'mute' && ` mikrofonunu kapattı.`}
                                        {log.type === 'unmute' && ` mikrofonunu açtı.`}
                                        {log.type === 'deafen' && ` kulaklığını kapattı.`}
                                    </p>
                                    <span>{log.time}</span>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            </div>

            <style dangerouslySetInnerHTML={{ __html: `
                .staff-panel { display: flex; flex-direction: column; gap: 2rem; padding: 1rem 0; }
                
                .stats-header-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 1.5rem; }
                .stat-card { padding: 1.5rem; display: flex; align-items: center; gap: 1.5rem; border-radius: 20px; transition: transform 0.3s ease; }
                .stat-card:hover { transform: translateY(-5px); }
                .stat-icon { width: 48px; height: 48px; border-radius: 14px; display: grid; place-items: center; }
                .stat-icon.users { background: rgba(52, 152, 219, 0.1); color: #3498db; }
                .stat-icon.active { background: rgba(46, 204, 113, 0.1); color: #2ecc71; }
                .stat-icon.afk { background: rgba(241, 196, 15, 0.1); color: #f1c40f; }
                .stat-info h3 { font-size: 1.8rem; font-weight: 800; line-height: 1.2; }
                .stat-info p { font-size: 0.85rem; color: var(--text-muted); text-transform: uppercase; letter-spacing: 1px; }

                .panel-layout { display: grid; grid-template-columns: 1fr 300px; gap: 1.5rem; }
                
                .main-section { padding: 1.5rem; border-radius: 24px; min-height: 500px; }
                .section-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 2rem; }
                .header-title { display: flex; align-items: center; gap: 12px; }
                .header-title h2 { font-size: 1.2rem; font-weight: 700; }
                .accent-text { color: var(--accent-gold); }

                .search-box { display: flex; align-items: center; gap: 10px; padding: 8px 16px; border-radius: 12px; background: rgba(255,255,255,0.03); border: 1px solid var(--card-border); }
                .search-box input { background: transparent; border: none; color: #fff; outline: none; font-size: 0.9rem; }

                .staff-table { width: 100%; border-collapse: collapse; }
                .staff-table th { text-align: left; padding: 12px; font-size: 0.75rem; color: var(--text-muted); text-transform: uppercase; letter-spacing: 1px; border-bottom: 1px solid var(--card-border); }
                .staff-table td { padding: 16px 12px; border-bottom: 1px solid rgba(255,255,255,0.02); }
                
                .user-cell { display: flex; align-items: center; gap: 12px; font-weight: 600; }
                .avatar-small { position: relative; width: 32px; height: 32px; }
                .avatar-small img { width: 100%; height: 100%; border-radius: 50%; }
                .status-indicator { position: absolute; bottom: 0; right: 0; width: 10px; height: 10px; border-radius: 50%; border: 2px solid var(--bg-color); }
                .status-indicator.online { background: #2ecc71; }
                .status-indicator.idle { background: #f1c40f; }
                .status-indicator.dnd { background: #e74c3c; }

                .role-badge { background: rgba(243, 156, 18, 0.1); color: var(--accent-gold); padding: 4px 10px; border-radius: 8px; font-size: 0.75rem; font-weight: 600; }
                .status-text { font-size: 0.85rem; font-weight: 500; }
                .status-text.active { color: #2ecc71; }
                .status-text.afk { color: #f1c40f; }
                .message-count { background: rgba(52, 152, 219, 0.1); color: #3498db; padding: 4px 8px; border-radius: 6px; font-weight: 700; font-family: monospace; }
                .channel-text { color: rgba(255,255,255,0.7); font-size: 0.9rem; }
                .time-text { font-family: monospace; color: #fff; font-weight: 600; }
                
                .action-dot { background: transparent; border: none; color: var(--text-muted); cursor: pointer; padding: 4px; border-radius: 6px; transition: var(--transition); }
                .action-dot:hover { background: rgba(255,255,255,0.05); color: #fff; }

                .activity-section { padding: 1.5rem; border-radius: 24px; min-height: 500px; border-left: 2px solid var(--accent-gold); background: rgba(0,0,0,0.1); }
                .logs-list { display: flex; flex-direction: column; gap: 1.2rem; }
                .log-item { display: flex; gap: 12px; position: relative; padding: 6px 0; }
                .log-item:not(:last-child):after { content: ''; position: absolute; left: 4px; top: 18px; bottom: -18px; width: 1px; background: rgba(255,255,255,0.05); }
                .log-indicator { width: 9px; height: 9px; border-radius: 50%; margin-top: 5px; flex-shrink: 0; position: relative; z-index: 2; border: 2px solid rgba(0,0,0,0.3); }
                .log-indicator.join { background: #2ecc71; box-shadow: 0 0 10px #2ecc71; }
                .log-indicator.move { background: #3498db; box-shadow: 0 0 10px #3498db; }
                .log-indicator.leave { background: #e74c3c; box-shadow: 0 0 10px #e74c3c; }
                .log-indicator.mute { background: #f1c40f; box-shadow: 0 0 10px #f1c40f; }
                .log-indicator.unmute { background: #2ecc71; box-shadow: 0 0 10px #2ecc71; }
                .log-indicator.deafen { background: #95a5a6; box-shadow: 0 0 10px #95a5a6; }
                
                .log-content p { font-size: 0.85rem; line-height: 1.4; color: rgba(255,255,255,0.9); margin: 0; }
                .log-content span { font-size: 0.7rem; color: var(--text-muted); font-weight: 600; text-transform: uppercase; }
                
                .live-pulse { color: #2ecc71; font-weight: 800; font-size: 0.7rem; border: 1px solid rgba(46, 204, 113, 0.2); padding: 4px 10px; border-radius: 20px; display: flex; align-items: center; gap: 6px; }
                .pulse-dot-small { width: 6px; height: 6px; background: #2ecc71; border-radius: 50%; box-shadow: 0 0 8px #2ecc71; animation: blink 1.5s infinite; }
                @keyframes blink { 0% { opacity: 0.3; } 50% { opacity: 1; } 100% { opacity: 0.3; } }
            `}} />
        </div>
    );
};

export default StaffPanel;
