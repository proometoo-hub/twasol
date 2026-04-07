import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Search, Users, X, MessageSquare, Radio, Sparkles, Bell, ArrowLeftRight } from 'lucide-react';
import api from '../api';
import { useAuth } from '../context/AuthContext';
import { useChat } from '../context/ChatContext';
import Avatar from './Avatar';
import { useLanguage } from '../context/LanguageContext';

export default function ChatList({ onCreateGroup }) {
  const { user } = useAuth();
  const { t, lang } = useLanguage();
  const { conversations, activeChat, selectChat, unreadCounts } = useChat();
  const [searchQ, setSearchQ] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [filter, setFilter] = useState(() => localStorage.getItem('chat_filter') || 'all');
  const debounceRef = useRef(null);

  const filters = [
    { key: 'all', label: t('all'), icon: MessageSquare },
    { key: 'private', label: t('private'), icon: MessageSquare },
    { key: 'groups', label: t('groups'), icon: Users },
    { key: 'channels', label: t('channels'), icon: Radio },
  ];

  useEffect(() => {
    localStorage.setItem('chat_filter', filter);
  }, [filter]);

  useEffect(() => {
    clearTimeout(debounceRef.current);
    const q = searchQ.trim();
    if (q.length <= 1) {
      setSearchResults([]);
      setSearching(false);
      return;
    }
    debounceRef.current = setTimeout(async () => {
      setSearching(true);
      try {
        const r = await api.get(`/users/search?q=${encodeURIComponent(q)}`);
        setSearchResults(r.data || []);
      } catch {
        setSearchResults([]);
      } finally {
        setSearching(false);
      }
    }, 280);
    return () => clearTimeout(debounceRef.current);
  }, [searchQ]);

  const startPrivateChat = async (other) => {
    try {
      const r = await api.get(`/rooms/private/${other.id}`);
      selectChat({ id: r.data.id, name: other.name, avatar: other.avatar, status: other.status, isGroup: false, userId: other.id });
      setSearchQ('');
      setSearchResults([]);
    } catch {}
  };

  const fmtTime = (d) => {
    if (!d) return '';
    const dt = new Date(d), diff = Date.now() - dt.getTime();
    if (diff < 86400000) return dt.toLocaleTimeString(lang === 'ar' ? 'ar' : 'en', { hour: '2-digit', minute: '2-digit' });
    if (diff < 172800000) return t('yesterday');
    return dt.toLocaleDateString(lang === 'ar' ? 'ar' : 'en');
  };

  const getDisplay = (conv) => {
    if (conv.isGroup || conv.isChannel) return { name: conv.name, avatar: conv.image || '', status: null, userId: null };
    const other = conv.members?.find(m => m.userId !== user.id)?.user;
    return { name: other?.name || 'محادثة', avatar: other?.avatar || '', status: other?.status, userId: other?.id, email: other?.email, publicId: other?.publicId };
  };

  const preview = (conv) => {
    const m = conv.messages?.[0];
    if (!m) return t('startConversation');
    if (m.isDeleted) return t('deletedMessage');
    if (m.type === 'image') return `📷 ${t('image')}`;
    if (m.type === 'video') return `🎬 ${t('video')}`;
    if (m.type === 'voice') return `🎤 ${t('voice')}`;
    if (m.type === 'file') return '📎 ' + (m.fileName || t('file'));
    return m.text || '';
  };

  const counts = useMemo(() => ({
    all: conversations.length,
    private: conversations.filter(c => !c.isGroup && !c.isChannel).length,
    groups: conversations.filter(c => c.isGroup).length,
    channels: conversations.filter(c => c.isChannel).length,
  }), [conversations]);

  const unreadTotal = useMemo(() => Object.values(unreadCounts || {}).reduce((sum, value) => sum + Number(value || 0), 0), [unreadCounts]);

  const visibleConversations = useMemo(() => {
    let items = conversations;
    if (filter === 'private') items = items.filter(c => !c.isGroup && !c.isChannel);
    else if (filter === 'groups') items = items.filter(c => c.isGroup);
    else if (filter === 'channels') items = items.filter(c => c.isChannel);

    return [...items]
      .filter(conv => {
        if (!searchQ.trim()) return true;
        const d = getDisplay(conv);
        const hay = [d.name, d.email, d.publicId, preview(conv)].filter(Boolean).join(' ').toLowerCase();
        return hay.includes(searchQ.trim().toLowerCase());
      })
      .sort((a, b) => {
        const unreadA = unreadCounts?.[a.id] || 0;
        const unreadB = unreadCounts?.[b.id] || 0;
        if (unreadA !== unreadB) return unreadB - unreadA;
        const ta = new Date(a.messages?.[0]?.createdAt || a.updatedAt || a.createdAt || 0).getTime();
        const tb = new Date(b.messages?.[0]?.createdAt || b.updatedAt || b.createdAt || 0).getTime();
        return tb - ta;
      });
  }, [conversations, filter, unreadCounts, searchQ]);

  return (
    <>
      <div className="sidebar-header polished-header refined-chat-header">
        <div>
          <div className="section-kicker">{t('basicSpace')}</div>
          <h2>{t('chats')}</h2>
          <div className="sidebar-header-meta">{visibleConversations.length} {visibleConversations.length === 1 ? t('visibleChats') : t('visibleChatsPlural')} • {t('quickSearchHint')}</div>
        </div>
        <button className="primary-action-btn" onClick={onCreateGroup} title={t('newGroup')}><Users size={18} /><span>{t('newChat')}</span></button>
      </div>

      <div className="chat-list-summary">
        <div className="summary-card active"><Sparkles size={15} /><div><strong>{counts.all}</strong><span>{t('totalChats')}</span></div></div>
        <div className="summary-card"><Bell size={15} /><div><strong>{unreadTotal}</strong><span>{t('unread')}</span></div></div>
        <div className="summary-card"><ArrowLeftRight size={15} /><div><strong>{counts.private}</strong><span>{t('privateChats')}</span></div></div>
      </div>

      <div className="search-box polished-search refined-search">
        <Search size={18} color="#8696a0" />
        <input placeholder={t('searchPlaceholderFull')} value={searchQ} onChange={e => setSearchQ(e.target.value)} />
        {searchQ && <button type="button" className="search-clear-btn" onClick={() => { setSearchQ(''); setSearchResults([]); }}><X size={16} /></button>}
      </div>

      <div className="search-helper-row">
        <span>{t('currentListAndUsers')}</span>
        <button type="button" className="quick-switch-inline" onClick={() => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', ctrlKey: true }))}>Ctrl + K</button>
      </div>

      <div className="chat-filter-grid">
        {filters.map(({ key, label, icon: Icon }) => (
          <button key={key} className={`chat-filter-chip refined ${filter === key ? 'active' : ''}`} onClick={() => setFilter(key)}>
            <span className="chat-filter-icon"><Icon size={14} /></span>
            <span>{label}</span><span className="chat-filter-count">{counts[key] || 0}</span>
          </button>
        ))}
      </div>

      <div className="conv-list refined-conv-list">
        {searchQ.trim().length > 1 && searching ? (
          <div style={{ textAlign: 'center', padding: 20, color: 'var(--text-secondary)' }}>{t('searching')}</div>
        ) : searchQ.trim().length > 1 && searchResults.length > 0 ? (
          <>
            <div className="search-section-title">{t('matchingUsers')}</div>
            {searchResults.map(u => (
              <div key={`search-${u.id}`} className="conv-item" onClick={() => startPrivateChat(u)}>
                <div className="avatar-wrap"><Avatar src={u.avatar} name={u.name} size={48} className="conv-avatar" />{u.status === 'online' && <div className="online-dot" />}</div>
                <div className="conv-info">
                  <div className="conv-name">{u.name}</div>
                  <div className="conv-last">{u.publicId ? `ID: ${u.publicId}` : (u.bio || u.email || t('available'))}</div>
                </div>
              </div>
            ))}
            <div className="search-section-title">{t('matchingChats')}</div>
            {visibleConversations.length === 0 && <div style={{ textAlign: 'center', padding: 16, color: 'var(--text-secondary)' }}>{t('noMatchingChats')}</div>}
          </>
        ) : null}

        {visibleConversations.length === 0 ? (
          <div style={{ textAlign: 'center', padding: 28, color: 'var(--text-secondary)' }}>{t('noChatsInSection')}</div>
        ) : visibleConversations.map(conv => {
          const d = getDisplay(conv), last = conv.messages?.[0], isActive = activeChat?.id === conv.id, unread = unreadCounts?.[conv.id] || 0;
          return (
            <div key={conv.id} className={`conv-item ${isActive ? 'active' : ''}`}
              onClick={() => selectChat({ id: conv.id, name: d.name, avatar: d.avatar, status: d.status, isGroup: conv.isGroup, isChannel: conv.isChannel, userId: d.userId })}>
              <div className="avatar-wrap"><Avatar src={d.avatar} name={d.name} size={48} className="conv-avatar" />{d.status === 'online' && <div className="online-dot" />}</div>
              <div className="conv-info"><div className="conv-name">{d.name} {conv.isChannel ? <span className="conv-type-badge">{t('channel')}</span> : conv.isGroup ? <span className="conv-type-badge">{t('group')}</span> : null}</div><div className="conv-last">{preview(conv)}</div></div>
              <div className="conv-meta">{last && <div className="conv-time">{fmtTime(last.createdAt)}</div>}{unread > 0 && <div className="unread-badge">{unread}</div>}</div>
            </div>
          );
        })}
      </div>
    </>
  );
}
