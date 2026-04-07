import React, { useState, useEffect } from 'react';
import { Plus, X, Trash2, Clock, Send } from 'lucide-react';
import api from '../api';

// ===== QUICK REPLIES MANAGER =====
export function QuickRepliesManager({ onSelect, onClose }) {
  const [replies, setReplies] = useState([]);
  const [newText, setNewText] = useState('');

  useEffect(() => { fetch(); }, []);
  const fetch = async () => { try { const r = await api.get('/quick-replies'); setReplies(r.data); } catch {} };

  const add = async () => {
    if (!newText.trim()) return;
    try { await api.post('/quick-replies', { text: newText.trim() }); setNewText(''); fetch(); } catch {}
  };

  const remove = async (id) => { try { await api.delete(`/quick-replies/${id}`); fetch(); } catch {} };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()} style={{ width: 380 }}>
        <h3>الردود السريعة</h3>
        <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
          <input className="auth-input" style={{ margin: 0, flex: 1 }} placeholder="أضف رد سريع..." value={newText} onChange={e => setNewText(e.target.value)} onKeyDown={e => e.key === 'Enter' && add()} />
          <button onClick={add} style={{ background: 'var(--accent)', color: 'white', border: 'none', borderRadius: 8, padding: '0 16px', cursor: 'pointer' }}><Plus size={18} /></button>
        </div>
        <div style={{ maxHeight: 300, overflowY: 'auto' }}>
          {replies.map(r => (
            <div key={r.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 0', borderBottom: '1px solid var(--border)' }}>
              <div onClick={() => { onSelect(r.text); onClose(); }} style={{ flex: 1, cursor: 'pointer', fontSize: 14 }}>{r.text}</div>
              <Trash2 size={16} style={{ cursor: 'pointer', color: 'var(--text-secondary)' }} onClick={() => remove(r.id)} />
            </div>
          ))}
          {replies.length === 0 && <div style={{ color: 'var(--text-secondary)', padding: 20, textAlign: 'center' }}>لا توجد ردود سريعة</div>}
        </div>
      </div>
    </div>
  );
}

// ===== SCHEDULE MESSAGE =====
export function ScheduleMessage({ conversationId, onClose, text }) {
  const [date, setDate] = useState('');
  const [time, setTime] = useState('');
  const [sending, setSending] = useState(false);

  const schedule = async () => {
    if (!date || !time || !text?.trim()) return;
    setSending(true);
    try {
      await api.post('/scheduled', { text: text.trim(), conversationId, scheduledAt: `${date}T${time}` });
      onClose();
    } catch {} finally { setSending(false); }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()} style={{ width: 340 }}>
        <h3><Clock size={20} style={{ verticalAlign: 'middle', marginLeft: 6 }} /> جدولة الرسالة</h3>
        <div style={{ background: 'var(--bg-tertiary)', padding: 12, borderRadius: 8, marginBottom: 16, fontSize: 14 }}>{text}</div>
        <input type="date" className="auth-input" value={date} onChange={e => setDate(e.target.value)} />
        <input type="time" className="auth-input" value={time} onChange={e => setTime(e.target.value)} />
        <div className="modal-actions">
          <button onClick={onClose} style={{ background: 'var(--bg-tertiary)', color: 'var(--text-primary)' }}>الغاء</button>
          <button onClick={schedule} disabled={!date || !time || sending} style={{ background: 'var(--accent)', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}><Send size={16} /> جدولة</button>
        </div>
      </div>
    </div>
  );
}

// ===== REPORT MODAL =====
export function ReportModal({ targetUser, onClose }) {
  const [reason, setReason] = useState('');
  const [details, setDetails] = useState('');
  const [sent, setSent] = useState(false);

  const reasons = ['محتوى مسيء', 'تحرش', 'احتيال', 'سبام', 'انتحال شخصية', 'أخرى'];

  const submit = async () => {
    if (!reason) return;
    try { await api.post('/reports', { reportedId: targetUser.id, reason, details }); setSent(true); setTimeout(onClose, 1500); } catch {}
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        {sent ? <div style={{ padding: 30, color: 'var(--accent)' }}>تم الإبلاغ بنجاح</div> : <>
          <h3>الإبلاغ عن {targetUser.name}</h3>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 16 }}>
            {reasons.map(r => <div key={r} onClick={() => setReason(r)} style={{ padding: '6px 14px', borderRadius: 20, fontSize: 13, cursor: 'pointer', background: reason === r ? 'var(--accent)' : 'var(--bg-tertiary)', color: reason === r ? 'white' : 'var(--text-primary)' }}>{r}</div>)}
          </div>
          <textarea className="auth-input" style={{ height: 80, resize: 'none' }} placeholder="تفاصيل إضافية (اختياري)..." value={details} onChange={e => setDetails(e.target.value)} />
          <div className="modal-actions">
            <button onClick={onClose} style={{ background: 'var(--bg-tertiary)', color: 'var(--text-primary)' }}>الغاء</button>
            <button onClick={submit} disabled={!reason} style={{ background: 'var(--danger)', color: 'white' }}>إبلاغ</button>
          </div>
        </>}
      </div>
    </div>
  );
}


export function ScheduledMessagesManager({ onClose, onSelectConversation }) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);

  const fetchItems = async () => {
    setLoading(true);
    try {
      const r = await api.get('/scheduled');
      setItems(r.data || []);
    } catch {} finally { setLoading(false); }
  };

  useEffect(() => { fetchItems(); }, []);

  const remove = async (id) => {
    try { await api.delete(`/scheduled/${id}`); fetchItems(); } catch {}
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()} style={{ width: 'min(92vw, 560px)' }}>
        <h3>الرسائل المجدولة</h3>
        <div style={{ maxHeight: 420, overflowY: 'auto' }}>
          {loading && <div style={{ color: 'var(--text-secondary)', textAlign: 'center', padding: 20 }}>جاري التحميل...</div>}
          {!loading && items.length === 0 && <div style={{ color: 'var(--text-secondary)', textAlign: 'center', padding: 24 }}>لا توجد رسائل مجدولة</div>}
          {items.map(item => (
            <div key={item.id} style={{ border:'1px solid var(--border)', borderRadius: 12, padding: 12, marginBottom: 10, background:'var(--bg-secondary)' }}>
              <div style={{ display:'flex', justifyContent:'space-between', gap:12, marginBottom: 8 }}>
                <div style={{ fontWeight:700 }}>{item.conversation?.name || 'محادثة'}</div>
                <div style={{ color:'var(--text-secondary)', fontSize:12 }}>{new Date(item.scheduledAt).toLocaleString('ar')}</div>
              </div>
              <div style={{ fontSize:14, marginBottom: 10, wordBreak:'break-word' }}>{item.text || item.fileName || 'مرفق'}</div>
              <div style={{ display:'flex', gap:8, justifyContent:'flex-end' }}>
                {item.conversation?.id && <button onClick={() => { onSelectConversation?.(item.conversation.id); onClose(); }} style={{ background:'var(--bg-tertiary)', color:'var(--text-primary)' }}>فتح المحادثة</button>}
                <button onClick={() => remove(item.id)} style={{ background:'var(--danger)', color:'white' }}>حذف</button>
              </div>
            </div>
          ))}
        </div>
        <div className="modal-actions">
          <button onClick={onClose} style={{ background: 'var(--bg-tertiary)', color: 'var(--text-primary)' }}>إغلاق</button>
        </div>
      </div>
    </div>
  );
}
