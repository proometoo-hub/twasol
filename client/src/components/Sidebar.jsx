import { useMemo, useState } from 'react';
import { t } from '../i18n/strings';
import { formatTime } from '../utils/format';
import Avatar from './Avatar';

const tabs = ['all', 'unread', 'pinned', 'archived'];

export default function Sidebar({
  locale,
  currentUser,
  conversations,
  activeConversationId,
  search,
  setSearch,
  openModal,
  setShowProfile,
  logout,
  filterTab,
  setFilterTab,
  onOpenConversation,
  onlineUserIds,
}) {
  const [joinCode, setJoinCode] = useState('');
  const filtered = useMemo(() => conversations.filter((conversation) => {
    const haystack = `${conversation.title} ${conversation.description || ''} ${(conversation.members || []).map((m) => m.displayName).join(' ')}`.toLowerCase();
    if (!haystack.includes(search.toLowerCase())) return false;
    if (filterTab === 'unread') return conversation.unreadCount > 0 && !conversation.archived;
    if (filterTab === 'pinned') return conversation.pinned && !conversation.archived;
    if (filterTab === 'archived') return conversation.archived;
    return !conversation.archived;
  }), [conversations, search, filterTab]);

  return (
    <aside className="sidebar">
      <div className="sidebar-top card">
        <div className="sidebar-user">
          <button type="button" className="user-chip" onClick={() => setShowProfile(true)}>
            <Avatar src={currentUser?.avatarUrl} name={currentUser?.displayName} />
            <div>
              <strong>{currentUser?.displayName}</strong>
              <span>@{currentUser?.username}</span>
            </div>
          </button>
          <button type="button" className="ghost-button" onClick={logout}>{t(locale, 'logout')}</button>
        </div>
        <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder={t(locale, 'sidebarSearch')} />
        <div className="sidebar-tabs">
          {tabs.map((item) => (
            <button key={item} type="button" className={filterTab === item ? 'is-active' : ''} onClick={() => setFilterTab(item)}>
              {t(locale, item === 'all' ? 'allChats' : item)}
            </button>
          ))}
        </div>
        <div className="sidebar-actions">
          <button onClick={() => openModal('direct')}>{t(locale, 'newChat')}</button>
          <button onClick={() => openModal('group')}>{t(locale, 'newGroup')}</button>
          <button onClick={() => openModal('channel')}>{t(locale, 'newChannel')}</button>
        </div>
        <div className="join-code-box">
          <input value={joinCode} onChange={(e) => setJoinCode(e.target.value)} placeholder={t(locale, 'joinWithCode')} />
          <button type="button" className="ghost-button" onClick={() => openModal('join', joinCode)}>{t(locale, 'joinWithCode')}</button>
        </div>
      </div>
      <div className="conversation-list card">
        {filtered.map((conversation) => {
          const other = conversation.type === 'direct' ? conversation.members?.find((member) => member.id !== currentUser?.id) : null;
          const online = other ? onlineUserIds.includes(other.id) : false;
          return (
            <button key={conversation.id} type="button" className={`conversation-item ${activeConversationId === conversation.id ? 'is-active' : ''}`} onClick={() => onOpenConversation(conversation.id)}>
              <div className="conversation-avatar-wrap">
                <Avatar src={conversation.avatarUrl} name={conversation.title} />
                {online && <span className="online-dot" />}
              </div>
              <div className="conversation-main">
                <div className="conversation-row">
                  <strong>{conversation.title}</strong>
                  <span>{formatTime(conversation.lastMessageAt || conversation.createdAt)}</span>
                </div>
                <div className="conversation-row conversation-meta">
                  <span>{conversation.lastMessageText || conversation.description || conversation.type}</span>
                  <div className="conversation-badges">
                    {conversation.pinned && <span className="pill">📌</span>}
                    {conversation.mutedUntil && <span className="pill">🔕</span>}
                    {conversation.unreadCount > 0 && <span className="count-badge">{conversation.unreadCount}</span>}
                  </div>
                </div>
              </div>
            </button>
          );
        })}
        {!filtered.length && <div className="empty-state">{search ? t(locale, 'emptySearch') : t(locale, 'noConversation')}</div>}
      </div>
    </aside>
  );
}
