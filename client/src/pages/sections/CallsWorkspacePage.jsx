export default function CallsWorkspacePage({ locale, directConversations, startCall, openConversation, callHistory }) {
  const quickRows = directConversations.slice(0, 8);
  const historyRows = callHistory.length ? callHistory : quickRows.map((item) => ({ id: item.id, peerName: item.title, status: locale === 'ar' ? 'جاهز للاتصال' : 'Ready to call' }));

  return (
    <div className="minimal-two-column">
      <section className="card minimal-page-card">
        <div className="minimal-page-head-row">
          <div>
            <strong>{locale === 'ar' ? 'ابدأ مكالمة' : 'Start a call'}</strong>
            <span>{locale === 'ar' ? 'صفحة مستقلة وخفيفة للمكالمات.' : 'A dedicated lightweight calls page.'}</span>
          </div>
        </div>
        <div className="minimal-chat-list">
          {quickRows.map((item) => (
            <div key={item.id} className="minimal-call-row">
              <div className="minimal-chat-row-body">
                <strong>{item.title}</strong>
                <span>{item.lastMessageText || (locale === 'ar' ? 'محادثة مباشرة' : 'Direct chat')}</span>
              </div>
              <div className="minimal-inline-actions">
                <button type="button" className="ghost-button compact" onClick={() => { openConversation(item.id); setTimeout(() => startCall('audio'), 80); }}>📞</button>
                <button type="button" className="ghost-button compact" onClick={() => { openConversation(item.id); setTimeout(() => startCall('video'), 80); }}>🎥</button>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="card minimal-page-card">
        <div className="minimal-page-head-row"><div><strong>{locale === 'ar' ? 'السجل' : 'History'}</strong></div></div>
        <div className="minimal-chat-list">
          {historyRows.map((item) => (
            <div key={item.id} className="minimal-call-row history">
              <div className="minimal-chat-row-body">
                <strong>{item.peerName || item.title}</strong>
                <span>{item.status || item.kind || 'call'}</span>
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
