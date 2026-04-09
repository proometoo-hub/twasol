import ChatWindow from '../../components/ChatWindow';
import { t } from '../../i18n/strings';

function ChatListRow({ conversation, onOpenConversation }) {
  return (
    <button type="button" className="minimal-chat-row" onClick={() => onOpenConversation(conversation.id)}>
      <div className="minimal-chat-row-side">
        {conversation.unreadCount > 0 ? <span className="minimal-badge">{conversation.unreadCount}</span> : null}
      </div>
      <div className="minimal-chat-row-body">
        <div className="minimal-chat-row-title">
          <strong>{conversation.title}</strong>
          <span>{conversation.pinned ? '📌' : ''}</span>
        </div>
        <span>{conversation.lastMessageText || conversation.description || conversation.type}</span>
      </div>
    </button>
  );
}

export default function ChatsWorkspacePage({
  locale,
  conversations,
  activeConversation,
  activeConversationId,
  search,
  setSearch,
  filterTab,
  setFilterTab,
  openNewModal,
  onOpenConversation,
  onBackToList,
  onlineUserIds,
  refreshing,
  messages,
  onSend,
  onBlock,
  startCall,
  onPreferenceChange,
  typingMap,
  onTyping,
  onLoadOlder,
  hasMore,
  onEditMessage,
  onDeleteMessage,
  onToggleStar,
  onForwardMessage,
  onRefreshConversation,
  onManageConversation,
  callHistory,
  currentUser,
  routeConversationId,
}) {
  const normalizedSearch = search.trim().toLowerCase();
  const filtered = conversations.filter((item) => {
    const matchesTab =
      filterTab === 'all'
      || (filterTab === 'unread' && item.unreadCount > 0)
      || (filterTab === 'direct' && item.type === 'direct')
      || (filterTab === 'group' && item.type === 'group')
      || (filterTab === 'channel' && item.type === 'channel');
    const haystack = `${item.title} ${item.lastMessageText || ''} ${item.description || ''}`.toLowerCase();
    return matchesTab && (!normalizedSearch || haystack.includes(normalizedSearch));
  });

  if (routeConversationId && activeConversationId) {
    return (
      <ChatWindow
        locale={locale}
        conversation={activeConversation}
        messages={messages}
        currentUser={currentUser}
        onSend={onSend}
        onBlock={onBlock}
        onStartCall={startCall}
        onPreferenceChange={onPreferenceChange}
        typingState={typingMap[activeConversationId] ? `${typingMap[activeConversationId]} ${locale === 'ar' ? 'يكتب...' : 'typing...'}` : ''}
        onTyping={onTyping}
        onlineUserIds={onlineUserIds}
        onLoadOlder={onLoadOlder}
        hasMore={hasMore}
        onEditMessage={onEditMessage}
        onDeleteMessage={onDeleteMessage}
        onToggleStar={onToggleStar}
        onForwardMessage={onForwardMessage}
        onRefreshConversation={onRefreshConversation}
        onManageConversation={onManageConversation}
        callHistory={callHistory}
        onBack={onBackToList}
      />
    );
  }

  return (
    <section className="card minimal-page-card">
      <div className="minimal-page-head-row">
        <div>
          <strong>{locale === 'ar' ? 'قائمة المحادثات' : 'Chats list'}</strong>
          <span>{locale === 'ar' ? 'اختر محادثة لتفتح في صفحة مستقلة.' : 'Choose a conversation to open in its own page.'}</span>
        </div>
        <div className="minimal-inline-actions">
          <button type="button" className="ghost-button compact" onClick={() => openNewModal('direct')}>{t(locale, 'newChat')}</button>
          <button type="button" className="ghost-button compact" onClick={() => openNewModal('group')}>{t(locale, 'newGroup')}</button>
        </div>
      </div>

      <div className="minimal-chats-toolbar">
        <div className="search-shell compact minimal-search-shell">
          <span>⌕</span>
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder={t(locale, 'sidebarSearch')} />
        </div>
        <div className="minimal-filter-strip">
          {['all', 'unread', 'direct', 'group', 'channel'].map((tab) => (
            <button key={tab} type="button" className={`minimal-filter-chip ${filterTab === tab ? 'is-active' : ''}`} onClick={() => setFilterTab(tab)}>
              {t(locale, tab)}
            </button>
          ))}
        </div>
      </div>

      {refreshing ? <div className="minimal-empty-state">{t(locale, 'loading')}</div> : null}

      {!refreshing && filtered.length ? (
        <div className="minimal-chat-list">
          {filtered.map((conversation) => <ChatListRow key={conversation.id} conversation={conversation} onOpenConversation={onOpenConversation} />)}
        </div>
      ) : null}

      {!refreshing && !filtered.length ? (
        <div className="minimal-empty-state">
          <strong>{t(locale, 'noConversation')}</strong>
          <span>{locale === 'ar' ? 'لا توجد نتائج لهذا الفلتر الآن.' : 'No results for this filter right now.'}</span>
        </div>
      ) : null}
    </section>
  );
}
