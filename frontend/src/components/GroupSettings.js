import React, { useState, useEffect } from 'react';
import { ArrowRight, Shield, ShieldOff, UserMinus, UserPlus, Volume2, VolumeX, Search, X, LogOut, Check, Ban, Crown, ImageOff, MicOff, Tags } from 'lucide-react';
import api from '../api';
import { useAuth } from '../context/AuthContext';
import { useChat } from '../context/ChatContext';
import { useSocket } from '../context/SocketContext';
import InviteLink from './InviteLink';
import Avatar from './Avatar';

export default function GroupSettings({ onClose, onShowMedia, onShowAudit }) {
  const { user } = useAuth();
  const { activeChat, fetchConversations, closeChat } = useChat();
  const socketRef = useSocket();
  const [info, setInfo] = useState(null);
  const [name, setName] = useState('');
  const [desc, setDesc] = useState('');
  const [welcomeMsg, setWelcomeMsg] = useState('');
  const [showAdd, setShowAdd] = useState(false);
  const [searchQ, setSearchQ] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [requests, setRequests] = useState([]);
  const [memberFilter, setMemberFilter] = useState('');

  useEffect(() => { if (activeChat) fetchInfo(); }, [activeChat?.id]);

  const fetchInfo = async () => {
    try {
      const r = await api.get(`/rooms/${activeChat.id}/info`);
      setInfo(r.data);
      setName(r.data.name || '');
      setDesc(r.data.description || '');
      setWelcomeMsg(r.data.welcomeMsg || '');
      if (r.data.myRole === 'admin') fetchRequests();
    } catch {}
  };

  const fetchRequests = async () => {
    try { const r = await api.get(`/rooms/${activeChat.id}/requests`); setRequests(r.data || []); } catch { setRequests([]); }
  };

  const isAdmin = info?.myRole === 'admin';
  const ownerUserId = info?.members?.slice().sort((a,b)=>new Date(a.joinedAt)-new Date(b.joinedAt)).find(m=>m.role==='admin')?.userId;
  const filteredMembers = (info?.members || []).filter(m => { const q = memberFilter.trim().toLowerCase(); if (!q) return true; return [m.user?.name, m.user?.bio, m.tag, m.userId?.toString()].filter(Boolean).some(v => String(v).toLowerCase().includes(q)); });

  const saveSetting = async (data) => {
    try {
      await api.put(`/rooms/${activeChat.id}/settings`, data);
      fetchInfo(); fetchConversations();
      socketRef.current?.emit('group_settings_updated', { conversationId: activeChat.id });
    } catch {}
  };

  const promoteUser = async (uid, role) => { try { await api.put(`/rooms/${activeChat.id}/members/${uid}/role`, { role }); fetchInfo(); } catch {} };
  const transferOwnership = async (uid) => { try { await api.post(`/rooms/${activeChat.id}/transfer-ownership/${uid}`); fetchInfo(); } catch {} };
  const muteUser = async (uid, muted) => { try { await api.put(`/rooms/${activeChat.id}/members/${uid}/mute`, { muted }); fetchInfo(); } catch {} };
  const removeMember = async (uid) => { try { await api.delete(`/rooms/${activeChat.id}/members/${uid}`); fetchInfo(); fetchConversations(); } catch {} };
  const leaveGroup = async () => { try { await api.delete(`/rooms/${activeChat.id}/leave`); closeChat(); onClose(); fetchConversations(); } catch {} };
  const toggleMuteNotifs = async () => { try { await api.put(`/rooms/${activeChat.id}/mute-notifs`); fetchInfo(); } catch {} };
  const approveRequest = async (id) => { try { await api.post(`/rooms/${activeChat.id}/requests/${id}/approve`); fetchRequests(); fetchInfo(); fetchConversations(); } catch {} };
  const rejectRequest = async (id) => { try { await api.post(`/rooms/${activeChat.id}/requests/${id}/reject`); fetchRequests(); } catch {} };
  const toggleMediaForUser = async (uid, allowed) => { try { await api.put(`/rooms/${activeChat.id}/members/${uid}/media`, { allowed }); fetchInfo(); } catch {} };
  const toggleVoiceForUser = async (uid, allowed) => { try { await api.put(`/rooms/${activeChat.id}/members/${uid}/voice`, { allowed }); fetchInfo(); } catch {} };
  const setMemberTag = async (uid, currentTag) => {
    const next = window.prompt('اكتب وصفًا قصيرًا للعضو داخل المجموعة', currentTag || '');
    if (next === null) return;
    try { await api.put(`/rooms/${activeChat.id}/members/${uid}/tag`, { tag: next }); fetchInfo(); } catch {}
  };
  const toggleBanForUser = async (uid, isBanned) => {
    const reason = !isBanned ? (window.prompt('سبب الحظر داخل هذه المجموعة/القناة', '') || '') : '';
    try { await api.put(`/rooms/${activeChat.id}/members/${uid}/ban`, { banned: !isBanned, reason }); fetchInfo(); fetchConversations(); } catch {}
  };

  const handleSearch = async (q) => {
    setSearchQ(q);
    if (q.length > 1) {
      try { const r = await api.get(`/users/search?q=${q}`); setSearchResults(r.data.filter(u => !info.members.some(m => m.userId === u.id))); } catch {}
    } else setSearchResults([]);
  };

  const addMember = async (uid) => {
    try { await api.post(`/rooms/${activeChat.id}/members`, { userId: uid }); fetchInfo(); setSearchQ(''); setSearchResults([]); fetchConversations(); } catch {}
  };

  if (!info) return <div style={{ padding: 20, color: 'var(--text-secondary)' }}>جاري التحميل...</div>;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: 'var(--bg-primary)' }}>
      <div className="chat-header"><div className="chat-header-info"><ArrowRight size={20} style={{ cursor: 'pointer' }} onClick={onClose} /><div className="name">اعدادات {info.isChannel ? 'القناة' : 'المجموعة'}</div></div></div>
      <div className="group-panel">
        <div className="group-panel-header">
          <img src={info.image || `https://ui-avatars.com/api/?name=${info.name}&background=2a3942&color=fff&size=200`} alt="" className="group-avatar" />
          <div style={{ flex: 1 }}>
            {isAdmin ? <input className="group-name-edit" value={name} onChange={e => setName(e.target.value)} onBlur={() => name.trim() && name !== info.name && saveSetting({ name: name.trim() })} />
              : <div style={{ fontSize: 18, fontWeight: 700 }}>{info.name}</div>}
            <div style={{ fontSize: 13, color: 'var(--text-secondary)' }}>{info.members.length} عضو</div>
          </div>
        </div>

        {isAdmin ? <textarea className="group-desc" value={desc} onChange={e => setDesc(e.target.value)} placeholder="وصف..." onBlur={() => desc !== (info.description || '') && saveSetting({ description: desc })} />
          : info.description ? <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 16, padding: 10, background: 'var(--bg-tertiary)', borderRadius: 8 }}>{info.description}</div> : null}

        {isAdmin && <textarea className="group-desc" value={welcomeMsg} onChange={e => setWelcomeMsg(e.target.value)} placeholder="رسالة ترحيب أو إعلان مختصر يظهر داخل المحادثة" onBlur={() => welcomeMsg !== (info.welcomeMsg || '') && saveSetting({ welcomeMsg })} />}

        <div className="group-toggle" onClick={toggleMuteNotifs}>
          <div><div className="group-toggle-label">كتم الإشعارات</div><div className="group-toggle-sub">لن تصلك إشعارات من هذه المحادثة</div></div>
          <div className={`toggle-switch ${info.myMuteNotifs ? 'on' : ''}`} />
        </div>

        {isAdmin && <div style={{ marginTop: 16, marginBottom: 16 }}>
          <div style={{ fontSize: 13, color: 'var(--accent)', fontWeight: 600, marginBottom: 8 }}>صلاحيات المسؤول</div>
          <div className="group-toggle" onClick={() => saveSetting({ onlyAdmins: !info.onlyAdmins })}><div><div className="group-toggle-label">المسؤولون فقط يرسلون</div><div className="group-toggle-sub">منع الاعضاء من الكتابة</div></div><div className={`toggle-switch ${info.onlyAdmins ? 'on' : ''}`} /></div>
          <div className="group-toggle" onClick={() => saveSetting({ noMedia: !info.noMedia })}><div><div className="group-toggle-label">منع الوسائط</div><div className="group-toggle-sub">منع صور وملفات وفيديو</div></div><div className={`toggle-switch ${info.noMedia ? 'on' : ''}`} /></div>
          <div className="group-toggle" onClick={() => saveSetting({ noVoice: !info.noVoice })}><div><div className="group-toggle-label">منع الرسائل الصوتية</div><div className="group-toggle-sub">فقط مشاهدة بدون تسجيل صوتي</div></div><div className={`toggle-switch ${info.noVoice ? 'on' : ''}`} /></div>
          <div className="group-toggle" onClick={() => saveSetting({ requireApproval: !info.requireApproval })}><div><div className="group-toggle-label">طلب موافقة قبل الانضمام</div><div className="group-toggle-sub">يتم تحويل المنضمين الجدد إلى طلبات بانتظار المراجعة</div></div><div className={`toggle-switch ${info.requireApproval ? 'on' : ''}`} /></div>
        </div>}

        <InviteLink conversationId={activeChat.id} conversationName={activeChat.name} isAdmin={isAdmin} requireApproval={!!info.requireApproval} />

        {isAdmin && info.requireApproval && (
          <div style={{ marginTop: 18, marginBottom: 12 }}>
            <div style={{ fontSize: 13, color: 'var(--accent)', fontWeight: 600, marginBottom: 8 }}>طلبات الانضمام ({requests.length})</div>
            {requests.length === 0 ? <div style={{ color: 'var(--text-secondary)', fontSize: 13, padding: 10, background: 'var(--bg-tertiary)', borderRadius: 8 }}>لا توجد طلبات انضمام معلقة</div> : requests.map(r => (
              <div key={r.id} className="member-item" style={{ background: 'var(--bg-tertiary)', borderRadius: 10, padding: 10, marginBottom: 8 }}>
                <Avatar src={r.user.avatar} name={r.user.name} size={42} />
                <div className="member-info">
                  <div className="member-name">{r.user.name}</div>
                  <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{r.user.publicId ? `ID: ${r.user.publicId}` : r.user.email}</div>
                </div>
                <div className="member-actions">
                  <button className="member-action-btn" onClick={() => approveRequest(r.id)} title="موافقة"><Check size={16} /></button>
                  <button className="member-action-btn danger" onClick={() => rejectRequest(r.id)} title="رفض"><Ban size={16} /></button>
                </div>
              </div>
            ))}
          </div>
        )}

        {isAdmin && <div style={{ padding: 12, background: 'var(--bg-tertiary)', borderRadius: 10, marginTop: 18, marginBottom: 12, fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.7 }}>
          من هنا تستطيع كتم العضو، منعه من الوسائط أو الصوتيات، إضافة وصف داخلي له، أو حظره من هذه المحادثة فقط.
        </div>}

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 20, marginBottom: 12 }}>
          <div style={{ fontSize: 13, color: 'var(--accent)', fontWeight: 600 }}>الاعضاء ({info.members.length})</div>
          {isAdmin && <div className="nav-item" style={{ width: 32, height: 32 }} onClick={() => setShowAdd(!showAdd)}>{showAdd ? <X size={18} /> : <UserPlus size={18} />}</div>}
        </div>
        <div className="search-box" style={{ margin: '0 0 12px 0' }}><Search size={16} color="#8696a0" /><input placeholder="ابحث داخل الأعضاء أو بالأوصاف الداخلية..." value={memberFilter} onChange={e => setMemberFilter(e.target.value)} /></div>

        {showAdd && isAdmin && <div style={{ marginBottom: 12 }}>
          <div className="search-box" style={{ margin: 0 }}><Search size={16} color="#8696a0" /><input placeholder="ابحث لاضافة عضو..." value={searchQ} onChange={e => handleSearch(e.target.value)} /></div>
          {searchResults.map(u => <div key={u.id} className="user-select-item" onClick={() => addMember(u.id)}><Avatar src={u.avatar} name={u.name} size={36} /><div><div style={{ fontWeight: 500 }}>{u.name}</div><div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{u.publicId ? `ID: ${u.publicId}` : (u.email || '')}</div></div><UserPlus size={16} color="var(--accent)" style={{ marginRight: 'auto' }} /></div>)}
        </div>}

        {filteredMembers.map(m => (
          <div key={m.id} className="member-item" style={{ alignItems: 'flex-start', opacity: m.isBanned ? 0.72 : 1 }}>
            <Avatar src={m.user.avatar} name={m.user.name} size={42} />
            <div className="member-info">
              <div className="member-name">{m.user.name}{m.userId === user.id && ' (أنت)'}{m.userId === ownerUserId && <span style={{ marginRight: 6, color: '#fbbc04', verticalAlign: 'middle' }}><Crown size={14} style={{ display: 'inline' }} /></span>}</div>
              <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginBottom: 6 }}>
                {m.role === 'admin' && <span className="member-role">مسؤول</span>}
                {m.userId === ownerUserId && <span className="member-role" style={{ background: 'rgba(251,188,4,.12)', color: '#fbbc04' }}>المالك</span>}
                {m.isMuted && <span style={{ fontSize: 11, color: 'var(--danger)' }}>مكتوم</span>}
                {!m.canSendMedia && <span className="member-role" style={{ background: 'rgba(234,67,53,.12)', color: 'var(--danger)' }}>وسائط مقيدة</span>}
                {!m.canSendVoice && <span className="member-role" style={{ background: 'rgba(234,67,53,.12)', color: 'var(--danger)' }}>صوتيات مقيدة</span>}
                {m.isBanned && <span className="member-role" style={{ background: 'rgba(234,67,53,.12)', color: 'var(--danger)' }}>محظور</span>}
              </div>
              {(m.tag || m.bannedReason) && <div style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.6 }}>{m.tag ? `الوصف: ${m.tag}` : ''}{m.tag && m.bannedReason ? ' • ' : ''}{m.bannedReason ? `سبب الحظر: ${m.bannedReason}` : ''}</div>}
            </div>
            {isAdmin && m.userId !== user.id && <div className="member-actions" style={{ flexWrap: 'wrap', justifyContent: 'flex-end', maxWidth: 160 }}>
              <button className="member-action-btn" onClick={() => promoteUser(m.userId, m.role === 'admin' ? 'member' : 'admin')} title={m.role === 'admin' ? 'إزالة مسؤول' : 'ترقية'}>{m.role === 'admin' ? <ShieldOff size={16} /> : <Shield size={16} />}</button>
              <button className="member-action-btn" onClick={() => muteUser(m.userId, !m.isMuted)} title={m.isMuted ? 'إلغاء كتم' : 'كتم'}>{m.isMuted ? <Volume2 size={16} /> : <VolumeX size={16} />}</button>
              <button className="member-action-btn" onClick={() => toggleMediaForUser(m.userId, !m.canSendMedia)} title={m.canSendMedia ? 'منع الوسائط' : 'السماح بالوسائط'}><ImageOff size={16} style={{ opacity: m.canSendMedia ? 1 : 0.55 }} /></button>
              <button className="member-action-btn" onClick={() => toggleVoiceForUser(m.userId, !m.canSendVoice)} title={m.canSendVoice ? 'منع الصوتيات' : 'السماح بالصوتيات'}><MicOff size={16} style={{ opacity: m.canSendVoice ? 1 : 0.55 }} /></button>
              <button className="member-action-btn" onClick={() => setMemberTag(m.userId, m.tag)} title="وصف داخلي"><Tags size={16} /></button>
              <button className={`member-action-btn ${m.isBanned ? '' : 'danger'}`} onClick={() => toggleBanForUser(m.userId, m.isBanned)} title={m.isBanned ? 'إلغاء الحظر' : 'حظر العضو'}><Ban size={16} /></button>
              {user.id === ownerUserId && <button className="member-action-btn" onClick={() => transferOwnership(m.userId)} title="نقل الملكية"><Crown size={16} /></button>}
              {!m.isBanned && m.role !== 'admin' && <button className="member-action-btn danger" onClick={() => removeMember(m.userId)} title="إزالة"><UserMinus size={16} /></button>}
            </div>}
          </div>
        ))}

        <div style={{ marginTop: 16, marginBottom: 8 }}>
          <div onClick={onShowMedia} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: 12, background: 'var(--bg-tertiary)', borderRadius: 8, cursor: 'pointer', marginBottom: 6, fontSize: 14 }}>
            <span>📁</span><span style={{ flex: 1 }}>الوسائط المشتركة</span><span style={{ color: 'var(--text-secondary)', fontSize: 18 }}>‹</span>
          </div>
          {isAdmin && <div onClick={onShowAudit} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: 12, background: 'var(--bg-tertiary)', borderRadius: 8, cursor: 'pointer', marginBottom: 6, fontSize: 14 }}>
            <span>📋</span><span style={{ flex: 1 }}>سجل الإجراءات</span><span style={{ color: 'var(--text-secondary)', fontSize: 18 }}>‹</span>
          </div>}
        </div>

        <div style={{ marginTop: 24, paddingTop: 16, borderTop: '1px solid var(--border)' }}>
          <button onClick={leaveGroup} style={{ width: '100%', padding: 12, border: 'none', borderRadius: 8, background: 'rgba(234,67,53,.1)', color: 'var(--danger)', cursor: 'pointer', fontFamily: 'inherit', fontWeight: 600, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}><LogOut size={18} /> مغادرة</button>
        </div>
      </div>
    </div>
  );
}
