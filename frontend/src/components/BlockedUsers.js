import React, { useState, useEffect } from 'react';
import { UserX, ArrowRight } from 'lucide-react';
import api, { buildAssetUrl } from '../api';

export default function BlockedUsers({ onClose }) {
  const [blocked, setBlocked] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => { fetchBlocked(); }, []);

  const fetchBlocked = async () => {
    try { const r = await api.get('/blocks'); setBlocked(r.data); }
    catch {} finally { setLoading(false); }
  };

  const unblock = async (userId) => {
    try { await api.delete(`/blocks/${userId}`); setBlocked(prev => prev.filter(u => u.id !== userId)); }
    catch {}
  };

  return (
    <>
      <div className="sidebar-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <ArrowRight size={20} style={{ cursor: 'pointer' }} onClick={onClose} />
          <h2>المحظورون</h2>
        </div>
      </div>
      <div style={{ flex: 1, overflowY: 'auto', padding: '0 12px' }}>
        {loading && <div style={{ textAlign: 'center', padding: 30, color: 'var(--text-secondary)' }}>جاري التحميل...</div>}
        {!loading && blocked.length === 0 && (
          <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-secondary)' }}>
            <UserX size={48} style={{ opacity: 0.3, marginBottom: 12 }} />
            <div>لا يوجد مستخدمون محظورون</div>
          </div>
        )}
        {blocked.map(u => (
          <div key={u.id} className="member-item">
            <img src={buildAssetUrl(u.avatar)} alt="" style={{ width: 42, height: 42, borderRadius: '50%', objectFit: 'cover' }} />
            <div className="member-info">
              <div className="member-name">{u.name}</div>
              <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{u.bio || ''}</div>
            </div>
            <button onClick={() => unblock(u.id)} style={{
              padding: '6px 14px', borderRadius: 6, border: 'none', background: 'rgba(234,67,53,.1)',
              color: 'var(--danger)', cursor: 'pointer', fontFamily: 'inherit', fontWeight: 600, fontSize: 12
            }}>الغاء الحظر</button>
          </div>
        ))}
      </div>
    </>
  );
}
