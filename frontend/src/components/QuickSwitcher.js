import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Search, MessageSquare, Users, Hash, CornerDownLeft } from 'lucide-react';
import api from '../api';
import { useAuth } from '../context/AuthContext';
import { useChat } from '../context/ChatContext';
import Avatar from './Avatar';
import { useLanguage } from '../context/LanguageContext';

export default function QuickSwitcher({ open, onClose }) {
  const { user } = useAuth();
  const { t } = useLanguage();
  const { conversations, selectChat, unreadCounts } = useChat();
  const [q, setQ] = useState('');
  const [remoteUsers, setRemoteUsers] = useState([]);
  const [loading, setLoading] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef(null);
  const timerRef = useRef(null);

  const getDisplay = (conv) => {
    if (conv.isGroup || conv.isChannel) return { name: conv.name, avatar: conv.image || '', userId: null, email: null, publicId: null };
    const other = conv.members?.find(m => m.userId !== user.id)?.user;
    return { name: other?.name || t('privateChat'), avatar: other?.avatar || '', userId: other?.id, email: other?.email, publicId: other?.publicId };
  };

  const localResults = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const items = [...conversations].map(conv => {
      const d = getDisplay(conv);
      const last = conv.messages?.[0];
      const text = [d.name, d.email, d.publicId, last?.text, last?.fileName].filter(Boolean).join(' ').toLowerCase();
      return {
        kind: 'conversation',
        id: `c-${conv.id}`,
        conv,
        display: d,
        subtitle: last?.text || last?.fileName || (conv.isChannel ? t('channel') : conv.isGroup ? t('group') : t('privateChat')), 
        unread: unreadCounts?.[conv.id] || 0,
        score: [d.name, d.publicId, d.email].filter(Boolean).join(' ').toLowerCase().includes(needle) ? 2 : 1,
        text
      };
    });
    const filtered = needle ? items.filter(item => item.text.includes(needle)) : items;
    return filtered.sort((a,b) => {
      if (a.score !== b.score) return b.score - a.score;
      if (a.unread !== b.unread) return b.unread - a.unread;
      const ta = new Date(a.conv.messages?.[0]?.createdAt || a.conv.updatedAt || a.conv.createdAt || 0).getTime();
      const tb = new Date(b.conv.messages?.[0]?.createdAt || b.conv.updatedAt || b.conv.createdAt || 0).getTime();
      return tb - ta;
    }).slice(0, 8);
  }, [conversations, q, unreadCounts, user?.id, t]);

  useEffect(() => {
    if (!open) return;
    setTimeout(() => inputRef.current?.focus(), 30);
  }, [open]);

  useEffect(() => {
    if (!open) {
      setQ('');
      setRemoteUsers([]);
      setLoading(false);
      setActiveIndex(0);
      return;
    }
  }, [open]);

  useEffect(() => {
    clearTimeout(timerRef.current);
    if (!open || q.trim().length < 2) {
      setRemoteUsers([]);
      setLoading(false);
      return;
    }
    timerRef.current = setTimeout(async () => {
      setLoading(true);
      try {
        const r = await api.get(`/users/search?q=${encodeURIComponent(q.trim())}`);
        const localUserIds = new Set(localResults.map(item => item.display.userId).filter(Boolean));
        setRemoteUsers((r.data || []).filter(u => u.id !== user.id && !localUserIds.has(u.id)).slice(0, 6));
      } catch {
        setRemoteUsers([]);
      } finally {
        setLoading(false);
      }
    }, 240);
    return () => clearTimeout(timerRef.current);
  }, [q, open, localResults, user?.id]);

  const allItems = useMemo(() => {
    const convItems = localResults;
    const userItems = remoteUsers.map(u => ({
      kind: 'user',
      id: `u-${u.id}`,
      user: u,
      title: u.name,
      subtitle: u.publicId ? `ID: ${u.publicId}` : (u.email || t('user')), 
    }));
    return [...convItems, ...userItems];
  }, [localResults, remoteUsers]);

  useEffect(() => {
    if (activeIndex >= allItems.length) setActiveIndex(0);
  }, [allItems.length, activeIndex]);

  if (!open) return null;

  const openUser = async (u) => {
    try {
      const r = await api.get(`/rooms/private/${u.id}`);
      selectChat({ id: r.data.id, name: u.name, avatar: u.avatar, status: u.status, isGroup: false, userId: u.id });
      onClose?.();
    } catch {}
  };

  const activate = async (item) => {
    if (!item) return;
    if (item.kind === 'conversation') {
      const conv = item.conv;
      selectChat({ id: conv.id, name: item.display.name, avatar: item.display.avatar, isGroup: conv.isGroup, isChannel: conv.isChannel, status: null, userId: item.display.userId });
      onClose?.();
      return;
    }
    if (item.kind === 'user') await openUser(item.user);
  };

  const onKeyDown = async (e) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setActiveIndex(i => Math.min(i + 1, Math.max(allItems.length - 1, 0))); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActiveIndex(i => Math.max(i - 1, 0)); }
    else if (e.key === 'Enter') { e.preventDefault(); await activate(allItems[activeIndex]); }
    else if (e.key === 'Escape') onClose?.();
  };

  return (
    <div className="overlay" onClick={onClose}>
      <div className="quick-switcher" onClick={(e) => e.stopPropagation()}>
        <div className="quick-switcher-header">
          <Search size={18} />
          <input
            ref={inputRef}
            value={q}
            onChange={(e) => { setQ(e.target.value); setActiveIndex(0); }}
            onKeyDown={onKeyDown}
            placeholder={t('searchChatUserId')}
          />
        </div>

        <div className="quick-switcher-hint">{t('quickJumpHint')}</div>

        <div className="quick-switcher-list">
          {allItems.length === 0 ? (
            <div className="quick-switcher-empty">{loading ? t('searching') : t('startTypingQuickAccess')}</div>
          ) : allItems.map((item, index) => (
            <button
              key={item.id}
              className={`quick-switcher-item ${index === activeIndex ? 'active' : ''}`}
              onMouseEnter={() => setActiveIndex(index)}
              onClick={() => activate(item)}
            >
              <div className="quick-switcher-avatar">
                {item.kind === 'conversation' ? (
                  <Avatar src={item.display.avatar} name={item.display.name} size={42} />
                ) : (
                  <Avatar src={item.user.avatar} name={item.user.name} size={42} />
                )}
              </div>
              <div className="quick-switcher-body">
                <div className="quick-switcher-title-row">
                  <div className="quick-switcher-title">{item.kind === 'conversation' ? item.display.name : item.title}</div>
                  <div className="quick-switcher-kind">
                    {item.kind === 'conversation' ? (
                      item.conv.isChannel ? <><Hash size={12} /> {t('channel')}</> : item.conv.isGroup ? <><Users size={12} /> {t('group')}</> : <><MessageSquare size={12} /> {t('private')}</>
                    ) : <><Users size={12} /> {t('user')}</>}
                  </div>
                </div>
                <div className="quick-switcher-subtitle">{item.kind === 'conversation' ? item.subtitle : item.subtitle}</div>
              </div>
              {item.kind === 'conversation' && item.unread > 0 ? <div className="quick-switcher-unread">{item.unread}</div> : <CornerDownLeft size={14} className="quick-switcher-enter" />}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
