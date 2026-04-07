import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Bell, RefreshCw, Check, X, Clock3, CalendarClock, MessageSquare, Radio, PauseCircle, PlayCircle, Wifi, WifiOff } from 'lucide-react';
import api from '../api';
import { useChat } from '../context/ChatContext';
import { useSocket } from '../context/SocketContext';

function timeText(value) {
  if (!value) return '';
  try {
    return new Date(value).toLocaleString('ar');
  } catch {
    return value;
  }
}

function relativeTime(value) {
  if (!value) return '';
  const diff = Math.max(0, Date.now() - new Date(value).getTime());
  const sec = Math.floor(diff / 1000);
  if (sec < 60) return 'الآن';
  const min = Math.floor(sec / 60);
  if (min < 60) return `قبل ${min} د`; 
  const hrs = Math.floor(min / 60);
  if (hrs < 24) return `قبل ${hrs} س`;
  const days = Math.floor(hrs / 24);
  return `قبل ${days} ي`;
}

export default function NotificationCenter({ onClose }) {
  const socketRef = useSocket();
  const { conversations, fetchConversations, openConversationById } = useChat();
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState(() => localStorage.getItem('notifTab') || 'all');
  const [joinRequests, setJoinRequests] = useState([]);
  const [reminders, setReminders] = useState([]);
  const [scheduled, setScheduled] = useState([]);
  const [recentEvents, setRecentEvents] = useState([]);
  const [autoRefresh, setAutoRefresh] = useState(() => localStorage.getItem('notifAutoRefresh') !== '0');
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [lastUpdatedAt, setLastUpdatedAt] = useState(null);
  const refreshTimer = useRef(null);
  const liveSeq = useRef(1);

  const pushEvent = (entry) => {
    const next = {
      id: `live-${liveSeq.current++}`,
      createdAt: new Date().toISOString(),
      ...entry
    };
    setRecentEvents(prev => [next, ...prev].slice(0, 25));
  };

  const load = async ({ silent = false } = {}) => {
    if (!silent) setLoading(true);
    setIsRefreshing(true);
    try {
      const [remRes, schRes] = await Promise.allSettled([
        api.get('/reminders'),
        api.get('/scheduled')
      ]);

      const nextReminders = remRes.status === 'fulfilled' ? (remRes.value.data || []) : [];
      const nextScheduled = schRes.status === 'fulfilled' ? (schRes.value.data || []) : [];
      setReminders(nextReminders);
      setScheduled(nextScheduled);

      const candidateRooms = (conversations || []).filter(c => ['group', 'channel'].includes(c.type));
      const reqResults = await Promise.allSettled(
        candidateRooms.map(async (room) => {
          const res = await api.get(`/rooms/${room.id}/requests`);
          return (res.data || []).map(item => ({ ...item, conversationName: room.name, conversationId: room.id }));
        })
      );
      const nextJoin = reqResults.flatMap(r => r.status === 'fulfilled' ? r.value : []);
      setJoinRequests(nextJoin);
      setLastUpdatedAt(new Date().toISOString());
    } finally {
      setLoading(false);
      setIsRefreshing(false);
    }
  };

  useEffect(() => { load(); }, []);

  useEffect(() => { try { localStorage.setItem('notifAutoRefresh', autoRefresh ? '1' : '0'); } catch {} }, [autoRefresh]);
  useEffect(() => { try { localStorage.setItem('notifTab', tab); } catch {} }, [tab]);

  useEffect(() => {
    if (!autoRefresh) {
      if (refreshTimer.current) clearInterval(refreshTimer.current);
      refreshTimer.current = null;
      return;
    }
    refreshTimer.current = setInterval(() => load({ silent: true }), 20000);
    return () => {
      if (refreshTimer.current) clearInterval(refreshTimer.current);
    };
  }, [autoRefresh, conversations]);

  useEffect(() => {
    const socket = socketRef.current;
    if (!socket) return;

    const onConnect = () => pushEvent({ kind: 'live', title: 'تم الاتصال بالخادم', meta: 'التحديثات اللحظية عادت للعمل', tone: 'success', icon: 'wifi' });
    const onDisconnect = () => pushEvent({ kind: 'live', title: 'انقطع الاتصال بالخادم', meta: 'سيحاول التطبيق إعادة الاتصال تلقائيًا', tone: 'danger', icon: 'wifi-off' });
    const onNewMessage = (msg) => {
      const room = conversations.find(c => c.id === msg.conversationId);
      pushEvent({ kind: 'live', title: `رسالة جديدة في ${room?.name || 'محادثة'}`, meta: msg.text || msg.fileName || msg.type || 'مرفق جديد', tone: 'info', conversationId: msg.conversationId });
    };
    const onEdited = (msg) => pushEvent({ kind: 'live', title: 'تم تعديل رسالة', meta: msg.text || 'جرى تعديل رسالة داخل التطبيق', tone: 'neutral' });
    const onDeleted = () => pushEvent({ kind: 'live', title: 'تم حذف رسالة', meta: 'تم تنفيذ حذف داخل إحدى المحادثات', tone: 'neutral' });
    const onBulkDeleted = ({ messageIds }) => pushEvent({ kind: 'live', title: 'حذف جماعي للرسائل', meta: `${messageIds?.length || 0} رسالة`, tone: 'neutral' });
    const onGroupUpdated = async () => {
      pushEvent({ kind: 'live', title: 'تحديث في مجموعة أو قناة', meta: 'تم تغيير الإعدادات أو الأعضاء', tone: 'info' });
      await fetchConversations();
      await load({ silent: true });
    };

    socket.on('connect', onConnect);
    socket.on('disconnect', onDisconnect);
    socket.on('new_message', onNewMessage);
    socket.on('message_edited', onEdited);
    socket.on('message_deleted', onDeleted);
    socket.on('messages_bulk_deleted', onBulkDeleted);
    socket.on('group_updated', onGroupUpdated);

    return () => {
      socket.off('connect', onConnect);
      socket.off('disconnect', onDisconnect);
      socket.off('new_message', onNewMessage);
      socket.off('message_edited', onEdited);
      socket.off('message_deleted', onDeleted);
      socket.off('messages_bulk_deleted', onBulkDeleted);
      socket.off('group_updated', onGroupUpdated);
    };
  }, [socketRef, conversations, fetchConversations]);

  const approveRequest = async (conversationId, requestId) => {
    try {
      await api.post(`/rooms/${conversationId}/requests/${requestId}/approve`);
      pushEvent({ kind: 'live', title: 'تمت الموافقة على طلب انضمام', meta: `رقم الطلب ${requestId}`, tone: 'success' });
      await fetchConversations();
      await load({ silent: true });
    } catch {}
  };

  const rejectRequest = async (conversationId, requestId) => {
    try {
      await api.post(`/rooms/${conversationId}/requests/${requestId}/reject`);
      pushEvent({ kind: 'live', title: 'تم رفض طلب انضمام', meta: `رقم الطلب ${requestId}`, tone: 'danger' });
      await load({ silent: true });
    } catch {}
  };

  const removeReminder = async (id) => {
    try {
      await api.delete(`/reminders/${id}`);
      setReminders(prev => prev.filter(r => r.id !== id));
      pushEvent({ kind: 'live', title: 'تم حذف التذكير', meta: `رقم ${id}`, tone: 'neutral' });
    } catch {}
  };

  const removeScheduled = async (id) => {
    try {
      await api.delete(`/scheduled/${id}`);
      setScheduled(prev => prev.filter(r => r.id !== id));
      pushEvent({ kind: 'live', title: 'تم حذف الرسالة المجدولة', meta: `رقم ${id}`, tone: 'neutral' });
    } catch {}
  };

  const items = useMemo(() => {
    const all = [
      ...joinRequests.map(item => ({ ...item, kind: 'join' })),
      ...reminders.map(item => ({ ...item, kind: 'reminder' })),
      ...scheduled.map(item => ({ ...item, kind: 'scheduled' })),
      ...recentEvents.map(item => ({ ...item, kind: 'live' }))
    ];
    const sorter = (a, b) => new Date((b.createdAt || b.remindAt || b.scheduledAt) || 0) - new Date((a.createdAt || a.remindAt || a.scheduledAt) || 0);
    const sorted = [...all].sort(sorter);
    if (tab === 'all') return sorted;
    return sorted.filter(item => item.kind === tab);
  }, [joinRequests, reminders, scheduled, recentEvents, tab]);

  const socketConnected = Boolean(socketRef.current?.connected);

  return (
    <div className="settings-view notification-center">
      <div className="settings-header">
        <div>
          <div className="settings-title">لوحة النشاط الحي والإشعارات</div>
          <div className="settings-subtitle">طلبات الانضمام، التذكيرات، الرسائل المجدولة، وآخر الأحداث المباشرة في مكان واحد</div>
        </div>
        <div className="settings-actions">
          <button className={`icon-btn ${autoRefresh ? 'active' : ''}`} onClick={() => setAutoRefresh(v => !v)} title={autoRefresh ? 'إيقاف التحديث التلقائي' : 'تشغيل التحديث التلقائي'}>
            {autoRefresh ? <PauseCircle size={18} /> : <PlayCircle size={18} />}
          </button>
          <button className="icon-btn" onClick={() => load()} title="تحديث"><RefreshCw size={18} className={isRefreshing ? 'spin' : ''} /></button>
          <button className="icon-btn" onClick={onClose}>إغلاق</button>
        </div>
      </div>

      <div className="live-status-row">
        <div className={`live-pill ${socketConnected ? 'ok' : 'bad'}`}>{socketConnected ? <Wifi size={14} /> : <WifiOff size={14} />}{socketConnected ? 'متصل الآن' : 'غير متصل'}</div>
        <div className={`live-pill ${autoRefresh ? 'auto' : ''}`}><Radio size={14} /> {autoRefresh ? 'تحديث تلقائي كل 20 ثانية' : 'التحديث التلقائي متوقف'}</div>
        <div className="live-last-update">آخر تحديث: {lastUpdatedAt ? `${timeText(lastUpdatedAt)} (${relativeTime(lastUpdatedAt)})` : '—'}</div>
      </div>

      <div className="notif-summary-grid">
        <div className="notif-summary-card"><Bell size={18} /><div><strong>{joinRequests.length}</strong><span>طلبات انضمام</span></div></div>
        <div className="notif-summary-card"><Clock3 size={18} /><div><strong>{reminders.length}</strong><span>تذكيرات نشطة</span></div></div>
        <div className="notif-summary-card"><CalendarClock size={18} /><div><strong>{scheduled.length}</strong><span>رسائل مجدولة</span></div></div>
        <div className="notif-summary-card"><Radio size={18} /><div><strong>{recentEvents.length}</strong><span>أحداث حيّة</span></div></div>
      </div>

      <div className="notif-tabs">
        <button className={tab === 'all' ? 'active' : ''} onClick={() => setTab('all')}>الكل</button>
        <button className={tab === 'live' ? 'active' : ''} onClick={() => setTab('live')}>حي</button>
        <button className={tab === 'join' ? 'active' : ''} onClick={() => setTab('join')}>الانضمام</button>
        <button className={tab === 'reminder' ? 'active' : ''} onClick={() => setTab('reminder')}>التذكيرات</button>
        <button className={tab === 'scheduled' ? 'active' : ''} onClick={() => setTab('scheduled')}>المجدولة</button>
      </div>

      {loading ? <div className="empty-state">جاري تحميل النشاطات...</div> : null}
      {!loading && items.length === 0 ? <div className="empty-state">لا توجد عناصر حالية في هذا القسم</div> : null}

      <div className="notif-list">
        {items.map(item => {
          if (item.kind === 'live') {
            return (
              <div className={`notif-card live ${item.tone || 'neutral'} ${item.conversationId ? 'clickable' : ''}`} key={item.id} onClick={() => item.conversationId ? openConversationById(item.conversationId) : undefined} role={item.conversationId ? 'button' : undefined} tabIndex={item.conversationId ? 0 : undefined} onKeyDown={(e) => { if (item.conversationId && (e.key === 'Enter' || e.key === ' ')) openConversationById(item.conversationId); }}>
                <div className="notif-card-head">
                  <span className="notif-badge live">نشاط حي</span>
                  <span className="notif-date">{relativeTime(item.createdAt)}</span>
                </div>
                <div className="notif-title">{item.title}</div>
                <div className="notif-meta">{item.meta || 'حدث جديد داخل التطبيق'}</div>
              </div>
            );
          }
          if (item.kind === 'join') {
            return (
              <div className="notif-card" key={`join-${item.id}`}>
                <div className="notif-card-head">
                  <span className="notif-badge join">طلب انضمام</span>
                  <span className="notif-date">{timeText(item.createdAt)}</span>
                </div>
                <div className="notif-title">{item.user?.name || item.user?.email || 'مستخدم'} يريد الانضمام إلى {item.conversationName}</div>
                <div className="notif-meta">{item.user?.email || 'بدون إيميل'}{item.user?.publicId ? ` • ID: ${item.user.publicId}` : ''}</div>
                <div className="notif-actions-row">
                  <button className="member-action-btn" onClick={() => approveRequest(item.conversationId, item.id)}><Check size={16} /> موافقة</button>
                  <button className="member-action-btn danger" onClick={() => rejectRequest(item.conversationId, item.id)}><X size={16} /> رفض</button>
                </div>
              </div>
            );
          }
          if (item.kind === 'reminder') {
            return (
              <div className="notif-card" key={`rem-${item.id}`}>
                <div className="notif-card-head">
                  <span className="notif-badge reminder">تذكير</span>
                  <span className="notif-date">{timeText(item.remindAt)}</span>
                </div>
                <div className="notif-title">{item.text || item.message?.text || 'تذكير بدون نص'}</div>
                <div className="notif-meta">مرتبط بالرسالة #{item.messageId}</div>
                <div className="notif-actions-row">
                  <button className="member-action-btn danger" onClick={() => removeReminder(item.id)}><X size={16} /> حذف</button>
                </div>
              </div>
            );
          }
          return (
            <div className="notif-card" key={`sch-${item.id}`}>
              <div className="notif-card-head">
                <span className="notif-badge scheduled">مجدولة</span>
                <span className="notif-date">{timeText(item.scheduledAt)}</span>
              </div>
              <div className="notif-title">{item.text || item.fileName || 'رسالة مجدولة'}</div>
              <div className="notif-meta"><MessageSquare size={14} /> {item.conversation?.name || 'محادثة'} </div>
              <div className="notif-actions-row">
                <button className="member-action-btn danger" onClick={() => removeScheduled(item.id)}><X size={16} /> حذف</button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
