import React, { useState } from 'react';
import { Search, X, FileText, Image as ImageIcon, Mic, Film } from 'lucide-react';
import api from '../api';

const typeLabel = (msg) => {
  if (msg.type === 'image') return '📷 صورة';
  if (msg.type === 'video') return '🎬 فيديو';
  if (msg.type === 'voice') return '🎤 رسالة صوتية';
  if (msg.type === 'file') return `📎 ${msg.fileName || 'ملف'}`;
  return msg.text;
};

const typeIcon = (type) => {
  if (type === 'image') return <ImageIcon size={15} />;
  if (type === 'video') return <Film size={15} />;
  if (type === 'voice') return <Mic size={15} />;
  if (type === 'file') return <FileText size={15} />;
  return <Search size={15} />;
};

export default function MessageSearch({ conversationId, onClose, onSelect }) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);

  const search = async (q) => {
    setQuery(q);
    if (q.trim().length < 2) { setResults([]); return; }
    setLoading(true);
    try {
      const r = await api.get(`/messages/${conversationId}/search?q=${encodeURIComponent(q)}`);
      setResults(r.data);
    } catch {} finally { setLoading(false); }
  };

  const fmtDate = (d) => {
    const dt = new Date(d);
    return dt.toLocaleDateString('ar', { day: 'numeric', month: 'short' }) + ' ' + dt.toLocaleTimeString('ar', { hour: '2-digit', minute: '2-digit' });
  };

  return (
    <div style={{ position: 'absolute', top: 0, right: 0, left: 0, bottom: 0, background: 'var(--bg-primary)', zIndex: 50, display: 'flex', flexDirection: 'column' }}>
      <div style={{ padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 10, background: 'var(--bg-secondary)', borderBottom: '1px solid var(--border)' }}>
        <X size={20} style={{ cursor: 'pointer', color: 'var(--text-secondary)' }} onClick={onClose} />
        <div className="search-box" style={{ margin: 0, flex: 1 }}>
          <Search size={16} color="#8696a0" />
          <input placeholder="ابحث في النصوص والمرفقات..." value={query} onChange={e => search(e.target.value)} autoFocus />
        </div>
      </div>
      <div style={{ flex: 1, overflowY: 'auto' }}>
        {loading && <div style={{ textAlign: 'center', padding: 20, color: 'var(--text-secondary)' }}>جاري البحث...</div>}
        {!loading && query.length >= 2 && results.length === 0 && <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-secondary)' }}>لا توجد نتائج مطابقة</div>}
        {results.map(msg => (
          <div key={msg.id} style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)', cursor: 'pointer' }} onClick={() => { onSelect?.(msg); onClose(); }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6, gap: 8 }}>
              <span style={{ fontWeight: 700, fontSize: 13 }}>{msg.sender?.name}</span>
              <span style={{ fontSize: 11, color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>{fmtDate(msg.createdAt)}</span>
            </div>
            <div style={{ fontSize: 14, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ color: 'var(--accent)' }}>{typeIcon(msg.type)}</span>
              <span style={{ wordBreak: 'break-word' }}>{typeLabel(msg)}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
