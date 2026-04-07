import React, { useEffect, useMemo, useState } from 'react';
import { CalendarDays, CheckSquare, Clock3, Plus, RefreshCw, Trash2, Check, BellRing, Copy, ListFilter } from 'lucide-react';
import api from '../api';
import { useChat } from '../context/ChatContext';

function fmt(value) {
  if (!value) return '—';
  try { return new Date(value).toLocaleString('ar'); } catch { return value; }
}

function isToday(dateValue) {
  if (!dateValue) return false;
  const d = new Date(dateValue);
  const now = new Date();
  return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth() && d.getDate() === now.getDate();
}

export default function DailyPlanner({ onClose }) {
  const { conversations, activeChat } = useChat();
  const roomOptions = useMemo(() => (conversations || []).filter(c => ['group', 'channel'].includes(c.type)), [conversations]);
  const [roomId, setRoomId] = useState(activeChat?.id || roomOptions[0]?.id || '');
  const [loading, setLoading] = useState(true);
  const [todos, setTodos] = useState([]);
  const [events, setEvents] = useState([]);
  const [reminders, setReminders] = useState([]);
  const [todoText, setTodoText] = useState('');
  const [eventTitle, setEventTitle] = useState('');
  const [eventStartAt, setEventStartAt] = useState('');
  const [viewMode, setViewMode] = useState(() => localStorage.getItem('plannerViewMode') || 'today');

  useEffect(() => {
    if (!roomId && roomOptions[0]?.id) setRoomId(roomOptions[0].id);
  }, [roomOptions, roomId]);

  const load = async () => {
    if (!roomId) {
      setTodos([]); setEvents([]); setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const [todoRes, eventRes, remRes] = await Promise.allSettled([
        api.get(`/todos/${roomId}`),
        api.get(`/calendar/${roomId}`),
        api.get('/reminders')
      ]);
      setTodos(todoRes.status === 'fulfilled' ? (todoRes.value.data || []) : []);
      setEvents(eventRes.status === 'fulfilled' ? (eventRes.value.data || []) : []);
      setReminders(remRes.status === 'fulfilled' ? (remRes.value.data || []) : []);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [roomId]);
  useEffect(() => { try { localStorage.setItem('plannerViewMode', viewMode); } catch {} }, [viewMode]);

  const addTodo = async () => {
    const text = todoText.trim();
    if (!text || !roomId) return;
    try {
      await api.post(`/todos/${roomId}`, { text });
      setTodoText('');
      await load();
    } catch {}
  };

  const toggleTodo = async (id) => {
    try {
      const res = await api.put(`/todos/${id}/toggle`);
      setTodos(prev => prev.map(item => item.id === id ? res.data : item));
    } catch {}
  };

  const deleteTodo = async (id) => {
    try {
      await api.delete(`/todos/${id}`);
      setTodos(prev => prev.filter(item => item.id !== id));
    } catch {}
  };

  const addEvent = async () => {
    if (!roomId || !eventTitle.trim() || !eventStartAt) return;
    try {
      await api.post(`/calendar/${roomId}`, { title: eventTitle.trim(), startAt: eventStartAt, endAt: eventStartAt });
      setEventTitle('');
      setEventStartAt('');
      await load();
    } catch {}
  };

  const deleteEvent = async (id) => {
    try {
      await api.delete(`/calendar/${id}`);
      setEvents(prev => prev.filter(item => item.id !== id));
    } catch {}
  };

  const deleteReminder = async (id) => {
    try {
      await api.delete(`/reminders/${id}`);
      setReminders(prev => prev.filter(item => item.id !== id));
    } catch {}
  };

  const todayTodos = todos.filter(item => !item.isDone).slice(0, 8);
  const doneTodos = todos.filter(item => item.isDone).slice(0, 6);
  const todayEvents = events.filter(item => isToday(item.startAt));
  const upcomingEvents = events.filter(item => !isToday(item.startAt)).slice(0, 8);
  const todayReminders = reminders.filter(item => isToday(item.remindAt));

  const visibleEvents = viewMode === 'today' ? todayEvents : viewMode === 'upcoming' ? upcomingEvents : events;
  const exportSummary = async () => {
    const lines = [
      'ملخص المتابعة اليومية',
      roomId ? `المحادثة: ${roomOptions.find(r => String(r.id) === String(roomId))?.name || roomId}` : 'المحادثة: —',
      '',
      'المهام المفتوحة:',
      ...(todayTodos.map(t => `- ${t.text}`) || ['- لا يوجد']),
      '',
      'الأحداث:',
      ...((visibleEvents.length ? visibleEvents : []).map(e => `- ${e.title} | ${fmt(e.startAt)}`) || ['- لا يوجد']),
      '',
      'تذكيرات اليوم:',
      ...(todayReminders.map(r => `- ${r.text || r.message?.text || 'تذكير'} | ${fmt(r.remindAt)}`) || ['- لا يوجد'])
    ].join('\n');
    try { await navigator.clipboard.writeText(lines); } catch {}
  };

  return (
    <div className="settings-view daily-planner">
      <div className="settings-header">
        <div>
          <div className="settings-title">لوحة المهام والمتابعة اليومية</div>
          <div className="settings-subtitle">تابع المهام، الاجتماعات، والتذكيرات اليومية من داخل التطبيق</div>
        </div>
        <div className="settings-actions">
          <button className="icon-btn" onClick={load} title="تحديث"><RefreshCw size={18} /></button>
          <button className="icon-btn" onClick={onClose}>إغلاق</button>
        </div>
      </div>

      <div className="planner-topbar">
        <div className="planner-room-picker">
          <span>المحادثة/المجموعة:</span>
          <select value={roomId} onChange={(e) => setRoomId(Number(e.target.value))}>
            {roomOptions.map(room => <option key={room.id} value={room.id}>{room.name}</option>)}
          </select>
        </div>
        <div className="planner-mini-cards">
          <div className="notif-summary-card"><CheckSquare size={18} /><div><strong>{todayTodos.length}</strong><span>مهام مفتوحة</span></div></div>
          <div className="notif-summary-card"><CalendarDays size={18} /><div><strong>{todayEvents.length}</strong><span>أحداث اليوم</span></div></div>
          <div className="notif-summary-card"><BellRing size={18} /><div><strong>{todayReminders.length}</strong><span>تذكيرات اليوم</span></div></div>
        </div>
      </div>

      <div className="planner-toolbar">
        <div className="notif-tabs compact">
          <button className={viewMode === 'today' ? 'active' : ''} onClick={() => setViewMode('today')}><ListFilter size={14} /> اليوم</button>
          <button className={viewMode === 'upcoming' ? 'active' : ''} onClick={() => setViewMode('upcoming')}>القادمة</button>
          <button className={viewMode === 'all' ? 'active' : ''} onClick={() => setViewMode('all')}>الكل</button>
        </div>
        <button className="profile-btn compact" onClick={exportSummary}><Copy size={15} /> نسخ الملخص</button>
      </div>

      <div className="planner-grid">
        <section className="planner-card">
          <div className="planner-card-head"><CheckSquare size={18} /> <strong>مهام اليوم</strong></div>
          <div className="planner-input-row">
            <input className="profile-input" value={todoText} onChange={(e) => setTodoText(e.target.value)} placeholder="أضف مهمة جديدة لهذه المحادثة" />
            <button className="profile-btn compact" onClick={addTodo}><Plus size={16} /> إضافة</button>
          </div>
          {loading ? <div className="empty-state">جاري التحميل...</div> : null}
          {!loading && todayTodos.length === 0 ? <div className="empty-state">لا توجد مهام مفتوحة حاليًا</div> : null}
          <div className="planner-list">
            {todayTodos.map(item => (
              <div className="planner-item" key={item.id}>
                <div className="planner-item-main">
                  <div className="planner-item-title">{item.text}</div>
                  <div className="planner-item-meta">أضيفت: {fmt(item.createdAt)}</div>
                </div>
                <div className="member-actions">
                  <button className="member-action-btn" onClick={() => toggleTodo(item.id)} title="إنهاء"><Check size={16} /></button>
                  <button className="member-action-btn danger" onClick={() => deleteTodo(item.id)} title="حذف"><Trash2 size={16} /></button>
                </div>
              </div>
            ))}
          </div>
          {doneTodos.length > 0 && <div className="planner-subblock"><div className="planner-subtitle">منجزة مؤخرًا</div>{doneTodos.map(item => <div className="planner-done" key={item.id}>{item.text}</div>)}</div>}
        </section>

        <section className="planner-card">
          <div className="planner-card-head"><CalendarDays size={18} /> <strong>الأحداث والمتابعة</strong></div>
          <div className="planner-input-row two">
            <input className="profile-input" value={eventTitle} onChange={(e) => setEventTitle(e.target.value)} placeholder="عنوان الحدث أو المتابعة" />
            <input className="profile-input" type="datetime-local" value={eventStartAt} onChange={(e) => setEventStartAt(e.target.value)} />
            <button className="profile-btn compact" onClick={addEvent}><Plus size={16} /> جدولة</button>
          </div>
          <div className="planner-subtitle">{viewMode === 'today' ? 'اليوم' : viewMode === 'upcoming' ? 'القادمة' : 'كل الأحداث'}</div>
          {visibleEvents.length === 0 ? <div className="empty-state">لا توجد أحداث ضمن هذا العرض</div> : null}
          <div className="planner-list">
            {visibleEvents.map(item => (
              <div className="planner-item" key={item.id}>
                <div className="planner-item-main">
                  <div className="planner-item-title">{item.title}</div>
                  <div className="planner-item-meta">{fmt(item.startAt)}</div>
                </div>
                <button className="member-action-btn danger" onClick={() => deleteEvent(item.id)}><Trash2 size={16} /></button>
              </div>
            ))}
          </div>
          {viewMode !== 'all' && upcomingEvents.length > 0 && viewMode === 'today' && <><div className="planner-subtitle">قادمة لاحقًا</div><div className="planner-list">{upcomingEvents.map(item => <div className="planner-item simple" key={item.id}><div className="planner-item-main"><div className="planner-item-title">{item.title}</div><div className="planner-item-meta">{fmt(item.startAt)}</div></div></div>)}</div></>}
        </section>

        <section className="planner-card span-two">
          <div className="planner-card-head"><Clock3 size={18} /> <strong>تذكيرات اليوم</strong></div>
          {todayReminders.length === 0 ? <div className="empty-state">لا توجد تذكيرات لهذا اليوم</div> : null}
          <div className="planner-list">
            {todayReminders.map(item => (
              <div className="planner-item" key={item.id}>
                <div className="planner-item-main">
                  <div className="planner-item-title">{item.text || item.message?.text || 'تذكير'}</div>
                  <div className="planner-item-meta">{fmt(item.remindAt)}</div>
                </div>
                <button className="member-action-btn danger" onClick={() => deleteReminder(item.id)}><Trash2 size={16} /></button>
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
