import React, { useState, useEffect } from 'react';
import { ArrowRight, Image, FileText, Mic, Film, Download } from 'lucide-react';
import { buildAssetUrl } from '../api';
import api from '../api';

const fmtSize = (b) => {
  if (!b) return '';
  if (b < 1024) return `${b} B`;
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`;
  return `${(b / (1024 * 1024)).toFixed(1)} MB`;
};

export default function SharedMedia({ conversationId, onClose }) {
  const [media, setMedia] = useState([]);
  const [tab, setTab] = useState('all');
  const [loading, setLoading] = useState(true);

  useEffect(() => { fetchMedia(); }, [conversationId]);
  const fetchMedia = async () => {
    setLoading(true);
    try { const r = await api.get(`/rooms/${conversationId}/media`); setMedia(r.data); } catch {} finally { setLoading(false); }
  };

  const filtered = media.filter(m => tab === 'all' || m.type === tab);
  const tabs = [
    { id: 'all', icon: FileText, label: 'الكل' },
    { id: 'image', icon: Image, label: 'صور' },
    { id: 'video', icon: Film, label: 'فيديو' },
    { id: 'file', icon: FileText, label: 'ملفات' },
    { id: 'voice', icon: Mic, label: 'صوتيات' }
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: 'var(--bg-primary)' }}>
      <div className="chat-header">
        <div className="chat-header-info">
          <ArrowRight size={20} style={{ cursor: 'pointer' }} onClick={onClose} />
          <div>
            <div className="name">الوسائط المشتركة</div>
            <div className="status">{media.length} عنصر</div>
          </div>
        </div>
      </div>
      <div className="chat-filter-row" style={{ borderBottom: '1px solid var(--border)', padding: '10px 12px' }}>
        {tabs.map(t => (
          <button key={t.id} className={`chat-filter-chip ${tab === t.id ? 'active' : ''}`} onClick={() => setTab(t.id)}>
            <t.icon size={14} />
            <span>{t.label}</span>
          </button>
        ))}
      </div>
      <div style={{ flex: 1, overflowY: 'auto', padding: 12 }}>
        {loading && <div style={{ textAlign: 'center', padding: 30, color: 'var(--text-secondary)' }}>جاري التحميل...</div>}
        {!loading && filtered.length === 0 && <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-secondary)' }}>لا توجد وسائط في هذا القسم</div>}
        {(tab === 'all' || tab === 'image') && filtered.some(m => m.type === 'image') && (
          <div className="media-grid">
            {filtered.filter(m => m.type === 'image').map(m => (
              <a key={m.id} href={buildAssetUrl(m.fileUrl)} target="_blank" rel="noreferrer" className="media-card">
                <img src={buildAssetUrl(m.fileUrl)} alt={m.fileName || ''} className="media-thumb" />
                <div className="media-card-meta">
                  <div>{m.sender?.name || 'مستخدم'}</div>
                  <div>{new Date(m.createdAt).toLocaleDateString('ar')}</div>
                </div>
              </a>
            ))}
          </div>
        )}
        {filtered.filter(m => m.type !== 'image').map(m => (
          <a key={m.id} href={buildAssetUrl(m.fileUrl)} target="_blank" rel="noreferrer" className="msg-file" style={{ marginBottom: 8 }}>
            <div className="msg-file-icon">{m.type === 'voice' ? <Mic size={20} color="white" /> : m.type === 'video' ? <Film size={20} color="white" /> : <FileText size={20} color="white" />}</div>
            <div className="msg-file-info">
              <div className="msg-file-name">{m.fileName || (m.type === 'voice' ? 'رسالة صوتية' : 'مرفق')}</div>
              <div className="msg-file-size">{m.sender?.name} • {fmtSize(m.fileSize)} • {new Date(m.createdAt).toLocaleDateString('ar')}</div>
            </div>
            <Download size={16} color="var(--text-secondary)" />
          </a>
        ))}
      </div>
    </div>
  );
}
