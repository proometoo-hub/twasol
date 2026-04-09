export default function GroupsWorkspacePage({ locale, groupedConversations, openConversation, openNewModal }) {
  const groups = groupedConversations.filter((item) => item.type === 'group');
  const channels = groupedConversations.filter((item) => item.type === 'channel');
  const rows = [...groups, ...channels];

  return (
    <section className="card minimal-page-card">
      <div className="minimal-page-head-row">
        <div>
          <strong>{locale === 'ar' ? 'المجموعات والقنوات' : 'Groups and channels'}</strong>
          <span>{locale === 'ar' ? 'في صفحة مستقلة بعيدًا عن الدردشة.' : 'On a separate page away from chat.'}</span>
        </div>
        <div className="minimal-inline-actions">
          <button type="button" className="ghost-button compact" onClick={() => openNewModal('group')}>{locale === 'ar' ? 'مجموعة' : 'Group'}</button>
          <button type="button" className="ghost-button compact" onClick={() => openNewModal('channel')}>{locale === 'ar' ? 'قناة' : 'Channel'}</button>
        </div>
      </div>

      <div className="minimal-chat-list">
        {rows.map((item) => (
          <button key={item.id} type="button" className="minimal-chat-row" onClick={() => openConversation(item.id)}>
            <div className="minimal-chat-row-side">{item.type === 'group' ? '👥' : '📢'}</div>
            <div className="minimal-chat-row-body">
              <strong>{item.title}</strong>
              <span>{item.description || item.lastMessageText || item.type}</span>
            </div>
          </button>
        ))}
        {!rows.length ? <div className="minimal-empty-state"><span>{locale === 'ar' ? 'لا توجد مجموعات أو قنوات بعد.' : 'No groups or channels yet.'}</span></div> : null}
      </div>
    </section>
  );
}
