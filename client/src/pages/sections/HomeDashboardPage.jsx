const shortcuts = [
  { key: 'chats', emoji: '💬', ar: 'المحادثات', en: 'Chats' },
  { key: 'calls', emoji: '📞', ar: 'المكالمات', en: 'Calls' },
  { key: 'groups', emoji: '👥', ar: 'المجموعات', en: 'Groups' },
  { key: 'discover', emoji: '✨', ar: 'الحالة', en: 'Status' },
  { key: 'settings', emoji: '⚙️', ar: 'الإعدادات', en: 'Settings' },
];

export default function HomeDashboardPage({ locale, stats, conversations, navigate, openConversation, statuses = [] }) {
  const recentChats = conversations.slice(0, 5);
  const myStatuses = statuses.filter((item) => item.isMine).length;
  const othersStatuses = statuses.filter((item) => !item.isMine).length;
  const pinnedChats = conversations.filter((item) => item.pinned).slice(0, 3);

  return (
    <div className="practical-home-stack">
      <section className="card minimal-page-card practical-hero-card">
        <div className="practical-hero-copy">
          <span className="page-kicker">{locale === 'ar' ? 'لوحة البداية' : 'Start here'}</span>
          <h2>{locale === 'ar' ? 'صفحة رئيسية أخف وأسهل' : 'A lighter, easier home page'}</h2>
          <p>
            {locale === 'ar'
              ? 'اختصارات عملية، معلومات أساسية فقط، وتمرير طبيعي للوصول لكل شيء بدون إخفاء الخيارات تحت الصفحة.'
              : 'Practical shortcuts, only the essential information, and natural scrolling so nothing gets hidden below the page.'}
          </p>
        </div>
        <div className="practical-hero-actions">
          <button type="button" className="primary-button" onClick={() => navigate('/chats')}>
            {locale === 'ar' ? 'فتح المحادثات' : 'Open chats'}
          </button>
          <button type="button" className="ghost-button" onClick={() => navigate('/discover')}>
            {locale === 'ar' ? 'الحالة' : 'Status'}
          </button>
        </div>
      </section>

      <section className="practical-summary-grid">
        <article className="card minimal-panel practical-summary-card">
          <strong>{stats.unread}</strong>
          <span>{locale === 'ar' ? 'رسائل غير مقروءة' : 'Unread messages'}</span>
        </article>
        <article className="card minimal-panel practical-summary-card">
          <strong>{myStatuses}</strong>
          <span>{locale === 'ar' ? 'حالتي' : 'My statuses'}</span>
        </article>
        <article className="card minimal-panel practical-summary-card">
          <strong>{othersStatuses}</strong>
          <span>{locale === 'ar' ? 'حالات الآخرين' : 'Others statuses'}</span>
        </article>
        <article className="card minimal-panel practical-summary-card">
          <strong>{stats.groups + stats.channels}</strong>
          <span>{locale === 'ar' ? 'مجموعات وقنوات' : 'Groups & channels'}</span>
        </article>
      </section>

      <section className="practical-home-grid">
        <section className="card minimal-panel practical-section">
          <div className="minimal-panel-head">
            <strong>{locale === 'ar' ? 'اختصارات' : 'Shortcuts'}</strong>
            <span>{locale === 'ar' ? 'انتقال سريع' : 'Quick access'}</span>
          </div>
          <div className="practical-shortcuts-grid">
            {shortcuts.map((item) => (
              <button key={item.key} type="button" className="minimal-shortcut practical-shortcut" onClick={() => navigate(`/${item.key}`)}>
                <span>{item.emoji}</span>
                <strong>{locale === 'ar' ? item.ar : item.en}</strong>
              </button>
            ))}
          </div>
        </section>

        <section className="card minimal-panel practical-section">
          <div className="minimal-panel-head">
            <strong>{locale === 'ar' ? 'الحالة' : 'Status'}</strong>
            <button type="button" className="ghost-button compact" onClick={() => navigate('/discover')}>
              {locale === 'ar' ? 'فتح' : 'Open'}
            </button>
          </div>
          <div className="practical-status-row">
            <div className="practical-status-box">
              <strong>{myStatuses}</strong>
              <span>{locale === 'ar' ? 'حالتي' : 'Mine'}</span>
            </div>
            <div className="practical-status-box">
              <strong>{othersStatuses}</strong>
              <span>{locale === 'ar' ? 'من الآخرين' : 'Others'}</span>
            </div>
          </div>
          <div className="practical-inline-note">
            {locale === 'ar' ? 'انشر حالة أو شاهد الحالات الحديثة من صفحة الحالة.' : 'Post a status or view recent stories from the status page.'}
          </div>
        </section>
      </section>

      <section className="practical-home-grid practical-home-grid-bottom">
        <section className="card minimal-panel practical-section">
          <div className="minimal-panel-head">
            <strong>{locale === 'ar' ? 'أحدث المحادثات' : 'Recent chats'}</strong>
            <span>{locale === 'ar' ? 'آخر نشاط' : 'Latest activity'}</span>
          </div>
          <div className="minimal-list practical-list">
            {recentChats.map((conversation) => (
              <button key={conversation.id} type="button" className="minimal-list-item practical-list-item" onClick={() => openConversation(conversation.id)}>
                <div className="minimal-list-meta">
                  {conversation.unreadCount > 0 ? <span className="minimal-badge">{conversation.unreadCount}</span> : null}
                </div>
                <div className="minimal-list-body">
                  <strong>{conversation.title}</strong>
                  <span>{conversation.lastMessageText || conversation.description || conversation.type}</span>
                </div>
              </button>
            ))}
            {!recentChats.length ? (
              <div className="minimal-empty-state">{locale === 'ar' ? 'لا توجد محادثات بعد.' : 'No chats yet.'}</div>
            ) : null}
          </div>
        </section>

        <section className="card minimal-panel practical-section">
          <div className="minimal-panel-head">
            <strong>{locale === 'ar' ? 'محادثات مثبتة' : 'Pinned chats'}</strong>
            <span>{locale === 'ar' ? 'الوصول السريع' : 'Quick access'}</span>
          </div>
          <div className="minimal-list practical-list compact">
            {pinnedChats.map((conversation) => (
              <button key={conversation.id} type="button" className="minimal-list-item practical-list-item compact" onClick={() => openConversation(conversation.id)}>
                <div className="minimal-list-body">
                  <strong>{conversation.title}</strong>
                  <span>{conversation.lastMessageText || conversation.description || conversation.type}</span>
                </div>
              </button>
            ))}
            {!pinnedChats.length ? (
              <div className="minimal-empty-state">{locale === 'ar' ? 'لا توجد محادثات مثبتة.' : 'No pinned chats.'}</div>
            ) : null}
          </div>
        </section>
      </section>
    </div>
  );
}
