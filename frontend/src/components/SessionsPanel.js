import React, { useEffect, useState } from 'react';
import { ArrowRight, Laptop, Smartphone, ShieldX } from 'lucide-react';
import api from '../api';
import { useAuth } from '../context/AuthContext';

export default function SessionsPanel({ onClose }) {
  const { logout } = useAuth();
  const [sessions, setSessions] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    try {
      const r = await api.get('/productivity/sessions');
      setSessions(r.data || []);
    } catch {
      setSessions([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const removeSession = async (sessionId) => {
    try {
      await api.delete(`/productivity/sessions/${sessionId}`);
      const removed = sessions.find(s => s.id === sessionId);
      setSessions(prev => prev.filter(s => s.id !== sessionId));
      if (removed?.isCurrent) {
        await api.post('/auth/logout').catch(() => {});
        logout();
      }
    } catch {}
  };

  const isMobileLike = (device = '') => /iphone|android|mobile|ipad/i.test(device);

  return (
    <>
      <div className="sidebar-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <ArrowRight size={20} style={{ cursor: 'pointer' }} onClick={onClose} />
          <h2>الأجهزة والجلسات</h2>
        </div>
      </div>
      <div style={{ flex: 1, overflowY: 'auto', padding: '0 16px 16px' }}>
        <div style={{ background: 'var(--bg-secondary)', borderRadius: 14, padding: 14, marginBottom: 12, fontSize: 13, color: 'var(--text-secondary)' }}>
          يمكنك رؤية الجلسات النشطة وحذف أي جهاز غير معروف. حذف الجلسة الحالية سيؤدي إلى تسجيل خروجك من هذا الجهاز.
        </div>
        {loading ? <div style={{ textAlign: 'center', padding: 24, color: 'var(--text-secondary)' }}>جاري التحميل...</div> : null}
        {!loading && sessions.length === 0 ? <div style={{ textAlign: 'center', padding: 24, color: 'var(--text-secondary)' }}>لا توجد جلسات نشطة</div> : null}
        {sessions.map((s, idx) => {
          const current = !!s.isCurrent;
          return (
            <div key={s.id} style={{ background: 'var(--bg-secondary)', borderRadius: 14, padding: 14, marginBottom: 10, border: current ? '1px solid var(--accent)' : '1px solid transparent' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <div style={{ width: 42, height: 42, borderRadius: 12, background: 'var(--bg-tertiary)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  {isMobileLike(s.device) ? <Smartphone size={20} /> : <Laptop size={20} />}
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 700, fontSize: 14 }}>{current ? 'هذا الجهاز' : (s.device || `جهاز ${idx + 1}`)}</div>
                  <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 3 }}>IP: {s.ip || 'غير معروف'}</div>
                  <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 2 }}>آخر استخدام: {new Date(s.lastUsed).toLocaleString('ar')}</div>
                </div>
                <button onClick={() => removeSession(s.id)} style={{ background: 'transparent', border: 'none', color: 'var(--danger)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}>
                  <ShieldX size={16} /> حذف
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </>
  );
}
