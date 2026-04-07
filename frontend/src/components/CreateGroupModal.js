import React, { useMemo, useState } from 'react';
import { Search, X, Users, Radio, FileText, ShieldCheck } from 'lucide-react';
import api from '../api';
import { useChat } from '../context/ChatContext';
import Avatar from './Avatar';
import { useLanguage } from '../context/LanguageContext';

export default function CreateGroupModal({ onClose }) {
  const { fetchConversations } = useChat();
  const { t } = useLanguage();
  const [step, setStep] = useState(1);
  const [type, setType] = useState('group');
  const [name, setName] = useState('');
  const [searchQ, setSearchQ] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [selectedUsers, setSelectedUsers] = useState([]);
  const [description, setDescription] = useState('');
  const [welcomeMsg, setWelcomeMsg] = useState('');
  const [requireApproval, setRequireApproval] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleSearch = async (q) => {
    setSearchQ(q);
    if (q.length > 1) { try { const r = await api.get(`/users/search?q=${q}`); setSearchResults(r.data); } catch {} }
    else setSearchResults([]);
  };

  const toggleUser = (u) => setSelectedUsers(prev => prev.find(s => s.id === u.id) ? prev.filter(s => s.id !== u.id) : [...prev, u]);

  const create = async () => {
    if (!name.trim() || selectedUsers.length === 0) return;
    setLoading(true);
    try { await api.post('/rooms/create', { name: name.trim(), description: description.trim() || undefined, welcomeMsg: welcomeMsg.trim() || undefined, requireApproval, isGroup: type === 'group', isChannel: type === 'channel', userIds: selectedUsers.map(u => u.id) }); fetchConversations(); onClose(); }
    catch {} finally { setLoading(false); }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()} style={{ width: 420 }}>
        {step === 1 && <>
          <h3>{t('createCollectiveChat')}</h3>
          <div className="user-select-item" style={{ background: 'rgba(0,168,132,.15)', borderRadius: 8, marginBottom: 8 }} onClick={() => { setType('group'); setStep(2); }}>
            <div style={{ width: 44, height: 44, borderRadius: '50%', background: 'var(--accent)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Users size={22} color="white" /></div>
            <div><div style={{ fontWeight: 600 }}>{t('group')}</div><div style={{ fontSize: 13, color: 'var(--text-secondary)' }}>{t('everyoneCanWrite')}</div></div>
          </div>
          <div className="user-select-item" style={{ borderRadius: 8 }} onClick={() => { setType('channel'); setStep(2); }}>
            <div style={{ width: 44, height: 44, borderRadius: '50%', background: '#1a237e', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Radio size={22} color="white" /></div>
            <div><div style={{ fontWeight: 600 }}>{t('channel')}</div><div style={{ fontSize: 13, color: 'var(--text-secondary)' }}>{t('adminsOnly')}</div></div>
          </div>
        </>}
        {step === 2 && <>
          <h3>{t('chooseMembers')}</h3>
          {selectedUsers.length > 0 && <div className="selected-users">{selectedUsers.map(u => <div key={u.id} className="user-chip">{u.name} <X size={14} onClick={() => toggleUser(u)} /></div>)}</div>}
          <div className="search-box" style={{ margin: '0 0 12px' }}><Search size={16} color="#8696a0" /><input placeholder={t('searchGeneric')} value={searchQ} onChange={e => handleSearch(e.target.value)} /></div>
          <div style={{ maxHeight: 250, overflowY: 'auto' }}>{searchResults.map(u => <div key={u.id} className={`user-select-item ${selectedUsers.find(s => s.id === u.id) ? 'selected' : ''}`} onClick={() => toggleUser(u)}><Avatar src={u.avatar} name={u.name} size={38} /><div><div style={{ fontWeight: 500 }}>{u.name}</div><div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{u.publicId ? `ID: ${u.publicId}` : (u.email || '')}</div></div></div>)}</div>
          <div className="modal-actions" style={{ marginTop: 16 }}><button onClick={() => setStep(1)} style={{ background: 'var(--bg-tertiary)', color: 'var(--text-primary)' }}>{t('back')}</button><button onClick={() => selectedUsers.length > 0 && setStep(3)} style={{ background: selectedUsers.length > 0 ? 'var(--accent)' : 'var(--bg-tertiary)', color: 'white' }}>{t('next')} ({selectedUsers.length})</button></div>
        </>}
        {step === 3 && <>
          <h3>{type === 'group' ? t('setupGroup') : t('setupChannel')}</h3>
          <input className="auth-input" placeholder={t('enterName')} value={name} onChange={e => setName(e.target.value)} autoFocus />
          <textarea className="auth-input" placeholder={t('shortDescriptionOptional')} value={description} onChange={e => setDescription(e.target.value)} rows={3} style={{ resize: 'vertical', minHeight: 84 }} />
          <textarea className="auth-input" placeholder={t('welcomeMessageOptional')} value={welcomeMsg} onChange={e => setWelcomeMsg(e.target.value)} rows={2} style={{ resize: 'vertical', minHeight: 64 }} />
          <div className="group-toggle" style={{ marginBottom: 12 }} onClick={() => setRequireApproval(v => !v)}>
            <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}><ShieldCheck size={16} /><div><div className="group-toggle-label">{t('requireApprovalJoin')}</div><div className="group-toggle-sub">{t('usefulForOrganizedRooms')}</div></div></div>
            <div className={`toggle-switch ${requireApproval ? 'on' : ''}`} />
          </div>
          <div className="creation-summary">{selectedUsers.length} {t('initialMembers')} • {type === 'group' ? t('interactiveGroup') : t('adminsPostingChannel')}</div>
          <div className="modal-actions"><button onClick={() => setStep(2)} style={{ background: 'var(--bg-tertiary)', color: 'var(--text-primary)' }}>{t('back')}</button><button onClick={create} disabled={loading || !name.trim()} style={{ background: name.trim() ? 'var(--accent)' : 'var(--bg-tertiary)', color: 'white' }}>{loading ? t('creating') : t('create')}</button></div>
        </>}
      </div>
    </div>
  );
}
