import React, { useState, useEffect, useRef } from 'react';
import { Plus, X, Image, Type } from 'lucide-react';
import { buildAssetUrl } from '../api';
import api from '../api';

const COLORS = ['#005c4b','#1a237e','#b71c1c','#e65100','#1b5e20','#4a148c','#006064','#880e4f','#33691e'];

export default function Stories() {
  const [groups, setGroups] = useState([]);
  const [showCreate, setShowCreate] = useState(false);
  const [createType, setCreateType] = useState(null);
  const [viewing, setViewing] = useState(null);
  const [viewIdx, setViewIdx] = useState(0);
  const [progress, setProgress] = useState(0);
  const timerRef = useRef(null);

  useEffect(() => { fetch(); }, []);
  const fetch = async () => { try { const r = await api.get('/stories/friends'); setGroups(r.data); } catch {} };

  const createText = async (text, color) => { try { await api.post('/stories/create', { text, color, type: 'text' }); setShowCreate(false); setCreateType(null); fetch(); } catch {} };
  const createMedia = async (file) => {
    try {
      const fd = new FormData(); fd.append('file', file);
      const u = await api.post('/stories/upload', fd, { headers: { 'Content-Type': 'multipart/form-data' } });
      await api.post('/stories/create', { mediaUrl: u.data.fileUrl, type: u.data.type });
      setShowCreate(false); setCreateType(null); fetch();
    } catch {}
  };

  useEffect(() => {
    if (!viewing) return;
    setProgress(0);
    const dur = viewing.stories[viewIdx]?.type === 'video' ? 15000 : 5000;
    const start = Date.now();
    const tick = () => {
      const p = Math.min(((Date.now() - start) / dur) * 100, 100);
      setProgress(p);
      if (p >= 100) { if (viewIdx < viewing.stories.length - 1) setViewIdx(i => i + 1); else setViewing(null); return; }
      timerRef.current = requestAnimationFrame(tick);
    };
    timerRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(timerRef.current);
  }, [viewing, viewIdx]);

  return (
    <>
      <div className="sidebar-header"><h2>الحالة</h2></div>
      <div className="stories-container">
        <div className="story-create-btn" onClick={() => setShowCreate(true)}><div className="story-create-icon"><Plus size={24} color="white" /></div><div><div style={{ fontWeight: 600 }}>حالتي</div><div style={{ fontSize: 13, color: 'var(--text-secondary)' }}>اضغط لاضافة حالة</div></div></div>
        {groups.map((g, i) => <div key={i} className="story-user-item" onClick={() => { setViewing(g); setViewIdx(0); }}><div className="story-ring"><img src={buildAssetUrl(g.user.avatar)} alt="" className="story-avatar" /></div><div><div style={{ fontWeight: 600 }}>{g.isMine ? 'حالتي' : g.user.name}</div><div className="story-count">{g.stories.length} حالة</div></div></div>)}
        {groups.length === 0 && <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-secondary)' }}>لا توجد حالات</div>}
      </div>

      {showCreate && !createType && <div className="modal-overlay" onClick={() => setShowCreate(false)}><div className="modal" onClick={e => e.stopPropagation()}><h3>اضافة حالة</h3><div style={{ display: 'flex', gap: 12 }}>
        <div style={{ flex: 1, padding: 20, background: 'var(--bg-tertiary)', borderRadius: 12, cursor: 'pointer', textAlign: 'center' }} onClick={() => setCreateType('text')}><Type size={32} color="var(--accent)" /><div style={{ marginTop: 8, fontWeight: 600 }}>نص</div></div>
        <div style={{ flex: 1, padding: 20, background: 'var(--bg-tertiary)', borderRadius: 12, cursor: 'pointer', textAlign: 'center' }} onClick={() => setCreateType('media')}><Image size={32} color="var(--accent)" /><div style={{ marginTop: 8, fontWeight: 600 }}>صورة/فيديو</div></div>
      </div></div></div>}

      {createType === 'text' && <TextCreator onClose={() => { setShowCreate(false); setCreateType(null); }} onCreate={createText} />}
      {createType === 'media' && <MediaCreator onClose={() => { setShowCreate(false); setCreateType(null); }} onCreate={createMedia} />}

      {viewing && viewing.stories[viewIdx] && <div className="story-viewer-overlay" onClick={() => setViewing(null)}><div className="story-viewer" style={{ background: viewing.stories[viewIdx].color || '#111' }} onClick={e => e.stopPropagation()}>
        <div className="story-progress">{viewing.stories.map((_, i) => <div key={i} className="story-progress-bar"><div className="story-progress-fill" style={{ width: i < viewIdx ? '100%' : i === viewIdx ? `${progress}%` : '0%' }} /></div>)}</div>
        <div className="story-viewer-header"><img src={buildAssetUrl(viewing.user.avatar)} alt="" style={{ width: 36, height: 36, borderRadius: '50%' }} /><span style={{ fontWeight: 600 }}>{viewing.isMine ? 'حالتي' : viewing.user.name}</span></div>
        <X className="story-viewer-close" size={24} onClick={() => setViewing(null)} />
        {viewing.stories[viewIdx].type === 'image' && viewing.stories[viewIdx].mediaUrl && <img src={buildAssetUrl(viewing.stories[viewIdx].mediaUrl)} alt="" className="story-media" />}
        {viewing.stories[viewIdx].type === 'video' && viewing.stories[viewIdx].mediaUrl && <video src={buildAssetUrl(viewing.stories[viewIdx].mediaUrl)} className="story-media" autoPlay muted />}
        {viewing.stories[viewIdx].text && <div className="story-text">{viewing.stories[viewIdx].text}</div>}
      </div></div>}
    </>
  );
}

function TextCreator({ onClose, onCreate }) {
  const [text, setText] = useState(''); const [color, setColor] = useState(COLORS[0]);
  return <div className="modal-overlay" onClick={onClose}><div className="modal" onClick={e => e.stopPropagation()}><h3>حالة نصية</h3>
    <div style={{ background: color, borderRadius: 12, padding: 24, marginBottom: 16, minHeight: 150, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <textarea placeholder="اكتب حالتك..." value={text} onChange={e => setText(e.target.value)} style={{ background: 'transparent', border: 'none', color: 'white', textAlign: 'center', fontSize: 18, fontFamily: 'inherit', outline: 'none', resize: 'none', width: '100%' }} /></div>
    <div className="color-picker">{COLORS.map(c => <div key={c} className={`color-dot ${color === c ? 'active' : ''}`} style={{ background: c }} onClick={() => setColor(c)} />)}</div>
    <div className="modal-actions"><button onClick={onClose} style={{ background: 'var(--bg-tertiary)', color: 'var(--text-primary)' }}>الغاء</button><button onClick={() => text.trim() && onCreate(text.trim(), color)} style={{ background: text.trim() ? 'var(--accent)' : 'var(--bg-tertiary)', color: 'white' }}>نشر</button></div>
  </div></div>;
}

function MediaCreator({ onClose, onCreate }) {
  const [preview, setPreview] = useState(null); const [file, setFile] = useState(null); const [isVid, setIsVid] = useState(false); const ref = useRef(null);
  const onFile = (e) => { const f = e.target.files?.[0]; if (!f) return; setFile(f); setIsVid(f.type.startsWith('video')); setPreview(URL.createObjectURL(f)); };
  return <div className="modal-overlay" onClick={onClose}><div className="modal" onClick={e => e.stopPropagation()}><h3>حالة مرئية</h3>
    {preview ? <div style={{ marginBottom: 16 }}>{isVid ? <video src={preview} controls style={{ width: '100%', borderRadius: 12, maxHeight: 300 }} /> : <img src={preview} alt="" style={{ width: '100%', borderRadius: 12, maxHeight: 300, objectFit: 'contain' }} />}</div>
      : <div onClick={() => ref.current?.click()} style={{ height: 200, background: 'var(--bg-tertiary)', borderRadius: 12, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', marginBottom: 16, gap: 8 }}><Image size={48} color="var(--text-secondary)" /><div style={{ color: 'var(--text-secondary)' }}>اختر صورة او فيديو</div></div>}
    <input ref={ref} type="file" hidden accept="image/*,video/*" onChange={onFile} />
    <div className="modal-actions"><button onClick={onClose} style={{ background: 'var(--bg-tertiary)', color: 'var(--text-primary)' }}>الغاء</button><button onClick={() => file && onCreate(file)} disabled={!file} style={{ background: file ? 'var(--accent)' : 'var(--bg-tertiary)', color: 'white' }}>نشر</button></div>
  </div></div>;
}
