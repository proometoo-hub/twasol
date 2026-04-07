import React, { useMemo, useState, useEffect } from 'react';
import { Link2, Copy, Check, Trash2, Plus, ShieldCheck, AlertTriangle, RotateCcw, Share2, BarChart3, Clock3, Users } from 'lucide-react';
import api from '../api';

export default function InviteLink({ conversationId, isAdmin, requireApproval, conversationName }) {
  const [links, setLinks] = useState([]);
  const [copied, setCopied] = useState(null);
  const [creating, setCreating] = useState(false);
  const [expiresInHours, setExpiresInHours] = useState('');
  const [maxUses, setMaxUses] = useState('');
  const [busyRevokeAll, setBusyRevokeAll] = useState(false);

  useEffect(() => { fetchLinks(); }, [conversationId]);

  const fetchLinks = async () => {
    try { const r = await api.get(`/invites/conv/${conversationId}`); setLinks(r.data); } catch {}
  };

  const stats = useMemo(() => {
    const totalUses = links.reduce((sum, link) => sum + (link.uses || 0), 0);
    const expiredCount = links.filter(link => link.isExpired).length;
    const expiringSoon = links.filter(link => {
      if (!link.expiresAt || link.isExpired) return false;
      const hours = (new Date(link.expiresAt).getTime() - Date.now()) / 36e5;
      return hours <= 24;
    }).length;
    return { active: links.length, totalUses, expiredCount, expiringSoon };
  }, [links]);

  const createLink = async () => {
    setCreating(true);
    try {
      await api.post(`/invites/${conversationId}`, {
        maxUses: maxUses ? Number(maxUses) : undefined,
        expiresInHours: expiresInHours ? Number(expiresInHours) : undefined
      });
      setExpiresInHours('');
      setMaxUses('');
      fetchLinks();
    }
    catch {} finally { setCreating(false); }
  };

  const deleteLink = async (id) => {
    try { await api.delete(`/invites/${id}`); fetchLinks(); } catch {}
  };

  const revokeAll = async () => {
    if (!window.confirm('إلغاء جميع روابط الدعوة النشطة؟')) return;
    setBusyRevokeAll(true);
    try { await api.delete(`/invites/conv/${conversationId}/revoke-all`); fetchLinks(); } catch {}
    finally { setBusyRevokeAll(false); }
  };

  const copyLink = (url) => {
    navigator.clipboard.writeText(url).then(() => { setCopied(url); setTimeout(() => setCopied(null), 2000); });
  };

  const shareLink = async (link) => {
    const shareText = `انضم إلى ${conversationName || 'هذه المحادثة'} عبر الرابط التالي:\n${link.url}`;
    try {
      if (navigator.share) {
        await navigator.share({ title: conversationName || 'دعوة', text: shareText, url: link.url });
      } else {
        await navigator.clipboard.writeText(shareText);
        setCopied(`share-${link.id}`);
        setTimeout(() => setCopied(null), 2000);
      }
    } catch {}
  };

  return (
    <div style={{ marginTop: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
        <div style={{ fontSize: 13, color: 'var(--accent)', fontWeight: 600 }}>
          <Link2 size={14} style={{ display: 'inline', verticalAlign: 'middle', marginLeft: 4 }} />
          روابط الدعوة
        </div>
        {isAdmin && (
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
            <button onClick={createLink} disabled={creating} style={{
              background: 'var(--accent)', color: 'white', border: 'none', borderRadius: 6,
              padding: '4px 10px', cursor: 'pointer', fontSize: 12, fontFamily: 'inherit',
              display: 'flex', alignItems: 'center', gap: 4
            }}><Plus size={14} /> رابط جديد</button>
            {links.length > 0 && <button onClick={revokeAll} disabled={busyRevokeAll} style={{ background: 'rgba(234,67,53,.08)', color: 'var(--danger)', border: 'none', borderRadius: 6, padding: '4px 10px', cursor: 'pointer', fontSize: 12, fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: 4 }}><RotateCcw size={14} /> إلغاء الكل</button>}
          </div>
        )}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(110px,1fr))', gap: 8, marginBottom: 10 }}>
        <div style={{ background: 'var(--bg-tertiary)', borderRadius: 10, padding: 10 }}><div style={{ fontSize: 11, color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: 4 }}><BarChart3 size={13} /> الروابط</div><div style={{ fontSize: 20, fontWeight: 800 }}>{stats.active}</div></div>
        <div style={{ background: 'var(--bg-tertiary)', borderRadius: 10, padding: 10 }}><div style={{ fontSize: 11, color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: 4 }}><Users size={13} /> الاستخدامات</div><div style={{ fontSize: 20, fontWeight: 800 }}>{stats.totalUses}</div></div>
        <div style={{ background: 'var(--bg-tertiary)', borderRadius: 10, padding: 10 }}><div style={{ fontSize: 11, color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: 4 }}><Clock3 size={13} /> تنتهي قريبًا</div><div style={{ fontSize: 20, fontWeight: 800 }}>{stats.expiringSoon}</div></div>
      </div>

      {isAdmin && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 10 }}>
          <input value={maxUses} onChange={e => setMaxUses(e.target.value.replace(/[^0-9]/g, ''))} placeholder="عدد الاستخدامات" className="auth-input" style={{ margin: 0 }} />
          <input value={expiresInHours} onChange={e => setExpiresInHours(e.target.value.replace(/[^0-9]/g, ''))} placeholder="ينتهي بعد كم ساعة" className="auth-input" style={{ margin: 0 }} />
        </div>
      )}

      {requireApproval && (
        <div style={{ fontSize: 12, color: 'var(--text-secondary)', background: 'var(--bg-tertiary)', borderRadius: 8, padding: 10, marginBottom: 8 }}>
          <ShieldCheck size={14} style={{ display: 'inline', verticalAlign: 'middle', marginLeft: 4 }} />
          المنضمون عبر الرابط سيتحولون إلى طلبات انضمام بانتظار موافقة المسؤولين.
        </div>
      )}

      {links.length === 0 && (
        <div style={{ fontSize: 13, color: 'var(--text-secondary)', padding: '8px 0' }}>لا توجد روابط دعوة</div>
      )}

      {links.map(link => (
        <div key={link.id} style={{
          display: 'flex', alignItems: 'center', gap: 8, padding: '10px 12px',
          background: 'var(--bg-tertiary)', borderRadius: 10, marginBottom: 8
        }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 13, fontFamily: 'monospace', direction: 'ltr', textAlign: 'left', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {link.url}
            </div>
            <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 5, display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              <span>استخدم {link.uses} مرة {link.maxUses ? `/ ${link.maxUses}` : ''}</span>
              {link.remainingUses !== null && <span>• المتبقي {link.remainingUses}</span>}
              {link.expiresAt ? <span>• ينتهي {new Date(link.expiresAt).toLocaleString('ar-EG')}</span> : null}
              {link.isExpired ? <span style={{ color: 'var(--danger)' }}><AlertTriangle size={12} style={{ display: 'inline', verticalAlign: 'middle', marginLeft: 3 }} />منتهي</span> : null}
            </div>
          </div>
          <button onClick={() => copyLink(link.url)} title="نسخ" style={{ background: 'none', border: 'none', cursor: 'pointer', color: copied === link.url ? 'var(--accent)' : 'var(--text-secondary)', padding: 4 }}>
            {copied === link.url ? <Check size={16} /> : <Copy size={16} />}
          </button>
          <button onClick={() => shareLink(link)} title="مشاركة" style={{ background: 'none', border: 'none', cursor: 'pointer', color: copied === `share-${link.id}` ? 'var(--accent)' : 'var(--text-secondary)', padding: 4 }}>
            {copied === `share-${link.id}` ? <Check size={16} /> : <Share2 size={16} />}
          </button>
          {isAdmin && (
            <button onClick={() => deleteLink(link.id)} title="حذف" style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)', padding: 4 }}><Trash2 size={16} /></button>
          )}
        </div>
      ))}
    </div>
  );
}
