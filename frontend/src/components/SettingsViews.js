import React, { useState, useEffect } from 'react';
import { ArrowRight, Download, Shield, Eye, EyeOff, BellOff, Palette, Lock } from 'lucide-react';
import api from '../api';
import { API_URL } from '../api';
import Avatar from './Avatar';

// ===== AUDIT LOG =====
export function AuditLogView({ conversationId, onClose }) {
  const [logs, setLogs] = useState([]);
  useEffect(() => { api.get(`/audit/${conversationId}`).then(r => setLogs(r.data)).catch(() => {}); }, [conversationId]);

  const actionLabels = { created: 'أنشأ', member_added: 'أضاف عضو', member_removed: 'أزال عضو', role_changed: 'غيّر صلاحية', settings_changed: 'غيّر الإعدادات', left: 'غادر', muted: 'كتم عضو', unmuted: 'الغى كتم' };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: 'var(--bg-primary)' }}>
      <div className="chat-header"><div className="chat-header-info"><ArrowRight size={20} style={{ cursor: 'pointer' }} onClick={onClose} /><div className="name">سجل الإجراءات</div></div></div>
      <div style={{ flex: 1, overflowY: 'auto', padding: 16 }}>
        {logs.map(log => (
          <div key={log.id} style={{ display: 'flex', gap: 12, padding: '10px 0', borderBottom: '1px solid var(--border)' }}>
            <Avatar src={log.user?.avatar} name={log.user?.name} size={36} />
            <div>
              <div style={{ fontSize: 14 }}><b>{log.user?.name}</b> {actionLabels[log.action] || log.action}</div>
              {log.details && <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{log.details}</div>}
              <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>{new Date(log.createdAt).toLocaleString('ar')}</div>
            </div>
          </div>
        ))}
        {logs.length === 0 && <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-secondary)' }}>لا توجد إجراءات</div>}
      </div>
    </div>
  );
}

// ===== ADMIN DASHBOARD =====
export function AdminDashboard({ onClose }) {
  const [stats, setStats] = useState(null);
  useEffect(() => { api.get('/users/admin/stats').then(r => setStats(r.data)).catch(() => {}); }, []);

  if (!stats) return <div style={{ padding: 30, textAlign: 'center', color: 'var(--text-secondary)' }}>جاري التحميل...</div>;

  const cards = [
    { label: 'المستخدمون', value: stats.totalUsers, color: '#00a884' },
    { label: 'متصلون الآن', value: stats.onlineUsers, color: '#4caf50' },
    { label: 'الرسائل الكلية', value: stats.totalMessages, color: '#2196f3' },
    { label: 'رسائل اليوم', value: stats.todayMessages, color: '#ff9800' },
    { label: 'المجموعات', value: stats.totalGroups, color: '#9c27b0' },
    { label: 'القنوات', value: stats.totalChannels, color: '#e91e63' },
    { label: 'بلاغات معلقة', value: stats.totalReports, color: '#f44336' },
    { label: 'حالات نشطة', value: stats.activeStories, color: '#009688' }
  ];

  return (
    <>
      <div className="sidebar-header"><div style={{ display: 'flex', alignItems: 'center', gap: 10 }}><ArrowRight size={20} style={{ cursor: 'pointer' }} onClick={onClose} /><h2>لوحة التحكم</h2></div></div>
      <div style={{ flex: 1, overflowY: 'auto', padding: 16 }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2,1fr)', gap: 10 }}>
          {cards.map(c => (
            <div key={c.label} style={{ background: 'var(--bg-secondary)', borderRadius: 12, padding: 16, borderRight: `3px solid ${c.color}` }}>
              <div style={{ fontSize: 24, fontWeight: 700, color: c.color }}>{c.value}</div>
              <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{c.label}</div>
            </div>
          ))}
        </div>
        {stats.topGroups?.length > 0 && <>
          <div style={{ fontSize: 13, color: 'var(--accent)', fontWeight: 600, marginTop: 20, marginBottom: 10 }}>أكثر المجموعات نشاطاً</div>
          {stats.topGroups.map(g => (
            <div key={g.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid var(--border)', fontSize: 13 }}>
              <span>{g.name}</span>
              <span style={{ color: 'var(--text-secondary)' }}>{g._count.messages} رسالة • {g._count.members} عضو</span>
            </div>
          ))}
        </>}
      </div>
    </>
  );
}

// ===== PRIVACY SETTINGS =====
export function PrivacySettings({ onClose }) {
  const [settings, setSettings] = useState(null);
  const [pinDraft, setPinDraft] = useState('');
  useEffect(() => { api.get('/privacy').then(r => setSettings(r.data)).catch(() => {}); }, []);

  const save = async (data) => {
    try { const r = await api.put('/privacy', data); setSettings(r.data); } catch {}
  };

  if (!settings) return null;

  const lastSeenOptions = [{ v: 'nobody', l: 'لا أحد' }, { v: 'contacts', l: 'جهات الاتصال' }, { v: 'everyone', l: 'الكل' }];
  const dndOptions = [{ v: null, l: 'إيقاف' }, { v: 1, l: 'ساعة' }, { v: 8, l: 'حتى الصباح' }, { v: 24, l: 'يوم كامل' }];

  return (
    <>
      <div className="sidebar-header"><div style={{ display: 'flex', alignItems: 'center', gap: 10 }}><ArrowRight size={20} style={{ cursor: 'pointer' }} onClick={onClose} /><h2>الخصوصية</h2></div></div>
      <div style={{ flex: 1, overflowY: 'auto', padding: '0 20px' }}>
        <div style={{ fontSize: 13, color: 'var(--accent)', fontWeight: 600, marginTop: 16, marginBottom: 8 }}><Eye size={14} style={{ verticalAlign: 'middle', marginLeft: 4 }} /> آخر ظهور</div>
        <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
          {lastSeenOptions.map(o => (
            <div key={o.v} onClick={() => save({ hideLastSeen: o.v })} style={{ flex: 1, padding: '10px 0', textAlign: 'center', borderRadius: 8, cursor: 'pointer', fontSize: 13, fontWeight: 600, background: settings.hideLastSeen === o.v ? 'var(--accent)' : 'var(--bg-tertiary)', color: settings.hideLastSeen === o.v ? 'white' : 'var(--text-primary)' }}>{o.l}</div>
          ))}
        </div>

        <div style={{ fontSize: 13, color: 'var(--accent)', fontWeight: 600, marginBottom: 8 }}><BellOff size={14} style={{ verticalAlign: 'middle', marginLeft: 4 }} /> وضع عدم الإزعاج</div>
        <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
          {dndOptions.map(o => {
            const isActive = o.v === null ? !settings.dndUntil : (settings.dndUntil && new Date(settings.dndUntil) > new Date());
            return <div key={String(o.v)} onClick={() => save({ dndUntil: o.v ? new Date(Date.now() + o.v * 3600000).toISOString() : null })} style={{ flex: 1, padding: '10px 0', textAlign: 'center', borderRadius: 8, cursor: 'pointer', fontSize: 13, background: 'var(--bg-tertiary)', color: 'var(--text-primary)' }}>{o.l}</div>;
          })}
        </div>

        <div style={{ fontSize: 13, color: 'var(--accent)', fontWeight: 600, marginBottom: 8 }}><Lock size={14} style={{ verticalAlign: 'middle', marginLeft: 4 }} /> قفل التطبيق</div>
        <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 12 }}>PIN مشفّر من 4 إلى 8 أرقام. {settings.hasLockedPin ? 'يوجد PIN محفوظ حاليًا.' : 'لا يوجد PIN محفوظ حاليًا.'}</p>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <input className="profile-input" type="password" placeholder="أدخل PIN جديد أو اتركه فارغًا للحذف" maxLength={8} value={pinDraft} onChange={e => setPinDraft(e.target.value.replace(/[^0-9]/g, '').slice(0, 8))} dir="ltr" />
          <button className="action-btn" onClick={() => save({ lockedPin: pinDraft || null }).then(() => setPinDraft(''))}>حفظ</button>
        </div>
      </div>
    </>
  );
}

// ===== THEME PICKER =====
export function ThemePicker({ onClose }) {
  const themes = [
    { name: 'dark', label: 'داكن', bg: '#111b21', accent: '#00a884' },
    { name: 'light', label: 'فاتح دافئ', bg: '#f5f0eb', accent: '#00a884' },
    { name: 'blue', label: 'أزرق', bg: '#0d1b2a', accent: '#4895ef' },
    { name: 'purple', label: 'بنفسجي', bg: '#1a0a2e', accent: '#9b59b6' },
    { name: 'forest', label: 'أخضر', bg: '#0a1f0a', accent: '#27ae60' },
  ];

  const apply = (name) => {
    document.documentElement.setAttribute('data-theme', name);
    localStorage.setItem('theme', name);
    api.put('/privacy', { themeName: name }).catch(() => {});
  };

  const current = localStorage.getItem('theme') || 'dark';

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <h3><Palette size={20} style={{ verticalAlign: 'middle', marginLeft: 6 }} /> اختر المظهر</h3>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 10 }}>
          {themes.map(t => (
            <div key={t.name} onClick={() => { apply(t.name); onClose(); }} style={{ padding: 16, borderRadius: 12, cursor: 'pointer', background: t.bg, border: current === t.name ? `2px solid ${t.accent}` : '2px solid transparent', textAlign: 'center' }}>
              <div style={{ width: 32, height: 32, borderRadius: '50%', background: t.accent, margin: '0 auto 8px' }} />
              <div style={{ fontSize: 12, color: '#fff' }}>{t.label}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ===== EXPORT CHAT =====
export function ExportChat({ conversationId, chatName, onClose }) {
  const [exporting, setExporting] = useState(false);

  const exportTxt = async () => {
    setExporting(true);
    try {
      const res = await api.get(`/export/${conversationId}?format=txt`, { responseType: 'blob' });
      const url = URL.createObjectURL(new Blob([res.data]));
      const a = document.createElement('a'); a.href = url; a.download = `${chatName || 'chat'}.txt`; a.click();
      URL.revokeObjectURL(url); onClose();
    } catch {} finally { setExporting(false); }
  };

  const exportJson = async () => {
    setExporting(true);
    try {
      const res = await api.get(`/export/${conversationId}`);
      const blob = new Blob([JSON.stringify(res.data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a'); a.href = url; a.download = `${chatName || 'chat'}.json`; a.click();
      URL.revokeObjectURL(url); onClose();
    } catch {} finally { setExporting(false); }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()} style={{ width: 320 }}>
        <h3><Download size={20} style={{ verticalAlign: 'middle', marginLeft: 6 }} /> تصدير المحادثة</h3>
        <div className="modal-actions" style={{ flexDirection: 'column' }}>
          <button onClick={exportTxt} disabled={exporting} style={{ background: 'var(--accent)', color: 'white', width: '100%' }}>تصدير كـ TXT</button>
          <button onClick={exportJson} disabled={exporting} style={{ background: 'var(--bg-tertiary)', color: 'var(--text-primary)', width: '100%' }}>تصدير كـ JSON</button>
          <button onClick={onClose} style={{ background: 'transparent', color: 'var(--text-secondary)', width: '100%' }}>الغاء</button>
        </div>
      </div>
    </div>
  );
}


export function ModerationCenter({ onClose }) {
  const [reports, setReports] = useState([]);
  const [summary, setSummary] = useState(null);
  const [status, setStatus] = useState('pending');
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [actingId, setActingId] = useState(null);

  const load = async (s = status, q = query) => {
    setLoading(true);
    try {
      const [list, sum] = await Promise.all([
        api.get(`/reports?status=${encodeURIComponent(s)}&q=${encodeURIComponent(q)}`),
        api.get('/reports/summary')
      ]);
      setReports(list.data || []);
      setSummary(sum.data || null);
    } catch {
      setReports([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);
  useEffect(() => {
    const t = setTimeout(() => load(status, query), 250);
    return () => clearTimeout(t);
  }, [status, query]);

  const setReportStatus = async (id, nextStatus) => {
    setActingId(id);
    try {
      await api.put(`/reports/${id}/status`, { status: nextStatus });
      await load(status, query);
    } catch {} finally {
      setActingId(null);
    }
  };

  const chips = [
    { v: 'pending', l: 'معلقة' },
    { v: 'reviewed', l: 'تمت مراجعتها' },
    { v: 'dismissed', l: 'مرفوضة' },
    { v: 'all', l: 'الكل' },
  ];

  return (
    <>
      <div className="sidebar-header"><div style={{ display: 'flex', alignItems: 'center', gap: 10 }}><ArrowRight size={20} style={{ cursor: 'pointer' }} onClick={onClose} /><h2>مركز الإشراف</h2></div></div>
      <div style={{ flex: 1, overflowY: 'auto', padding: 16 }}>
        {summary && <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 8, marginBottom: 14 }}>
          {[
            ['المعلقة', summary.pending, 'var(--danger)'],
            ['راجعتها الإدارة', summary.reviewed, 'var(--accent)'],
            ['مرفوضة', summary.dismissed, '#8696a0'],
            ['اليوم', summary.today, '#ff9800'],
          ].map(([label, value, color]) => (
            <div key={label} style={{ background: 'var(--bg-secondary)', borderRadius: 12, padding: 12, borderRight: `3px solid ${color}` }}>
              <div style={{ fontSize: 20, fontWeight: 800, color }}>{value}</div>
              <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>{label}</div>
            </div>
          ))}
        </div>}

        <div className="search-box" style={{ marginBottom: 10 }}><Search size={16} color="#8696a0" /><input placeholder="ابحث بالاسم، الإيميل، الـ ID، أو سبب البلاغ..." value={query} onChange={e => setQuery(e.target.value)} /></div>
        <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
          {chips.map(c => <div key={c.v} onClick={() => setStatus(c.v)} style={{ padding: '7px 14px', borderRadius: 20, cursor: 'pointer', fontSize: 13, background: status === c.v ? 'var(--accent)' : 'var(--bg-tertiary)', color: status === c.v ? '#fff' : 'var(--text-primary)' }}>{c.l}</div>)}
        </div>

        {loading ? <div style={{ textAlign: 'center', padding: 30, color: 'var(--text-secondary)' }}>جاري تحميل البلاغات...</div> : null}
        {!loading && reports.length === 0 ? <div style={{ textAlign: 'center', padding: 30, color: 'var(--text-secondary)', background: 'var(--bg-secondary)', borderRadius: 12 }}>لا توجد بلاغات ضمن هذا الفلتر</div> : null}

        {reports.map(r => (
          <div key={r.id} style={{ background: 'var(--bg-secondary)', borderRadius: 14, padding: 14, marginBottom: 10, border: '1px solid var(--border)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, marginBottom: 8 }}>
              <div style={{ fontSize: 14, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 6 }}><ShieldAlert size={16} color="var(--danger)" /> {r.reason}</div>
              <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>{new Date(r.createdAt).toLocaleString('ar')}</div>
            </div>
            <div style={{ fontSize: 13, marginBottom: 4 }}><b>المبلِّغ:</b> {r.reporter?.name} {r.reporter?.publicId ? `• ${r.reporter.publicId}` : ''}</div>
            <div style={{ fontSize: 13, marginBottom: 8 }}><b>المبلَّغ عنه:</b> {r.reported?.name} {r.reported?.publicId ? `• ${r.reported.publicId}` : ''}</div>
            {r.details ? <div style={{ whiteSpace: 'pre-wrap', fontSize: 12, color: 'var(--text-secondary)', background: 'var(--bg-tertiary)', borderRadius: 10, padding: 10, marginBottom: 10 }}>{r.details}</div> : null}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
              <div style={{ fontSize: 12, color: r.status === 'pending' ? 'var(--danger)' : r.status === 'reviewed' ? 'var(--accent)' : 'var(--text-secondary)', fontWeight: 700 }}>الحالة: {r.status === 'pending' ? 'معلقة' : r.status === 'reviewed' ? 'تمت مراجعتها' : 'مرفوضة'}</div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button disabled={actingId === r.id || r.status === 'reviewed'} onClick={() => setReportStatus(r.id, 'reviewed')} style={{ background: 'var(--accent)', color: '#fff', border: 'none', borderRadius: 10, padding: '8px 12px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}><CheckCircle2 size={15} /> مراجعة</button>
                <button disabled={actingId === r.id || r.status === 'dismissed'} onClick={() => setReportStatus(r.id, 'dismissed')} style={{ background: 'var(--bg-tertiary)', color: 'var(--text-primary)', border: 'none', borderRadius: 10, padding: '8px 12px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}><XCircle size={15} /> رفض</button>
                {r.status !== 'pending' ? <button disabled={actingId === r.id} onClick={() => setReportStatus(r.id, 'pending')} style={{ background: 'transparent', color: 'var(--text-secondary)', border: '1px solid var(--border)', borderRadius: 10, padding: '8px 12px', cursor: 'pointer' }}>إرجاع</button> : null}
              </div>
            </div>
          </div>
        ))}
      </div>
    </>
  );
}
