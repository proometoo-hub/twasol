import React, { useState } from 'react';
import { Plus, X, BarChart3 } from 'lucide-react';
import api from '../api';
import { useAuth } from '../context/AuthContext';

export function PollCreator({ conversationId, onClose, onCreated }) {
  const [question, setQuestion] = useState('');
  const [options, setOptions] = useState(['', '']);
  const [multi, setMulti] = useState(false);

  const addOption = () => { if (options.length < 8) setOptions([...options, '']); };
  const removeOption = (i) => { if (options.length > 2) setOptions(options.filter((_, idx) => idx !== i)); };
  const updateOption = (i, v) => { const o = [...options]; o[i] = v; setOptions(o); };

  const create = async () => {
    const valid = options.filter(o => o.trim());
    if (!question.trim() || valid.length < 2) return;
    try {
      await api.post(`/polls/${conversationId}`, { question: question.trim(), options: valid.map(o => o.trim()), multiChoice: multi });
      onCreated?.(); onClose();
    } catch {}
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()} style={{ width: 400 }}>
        <h3>استطلاع رأي</h3>
        <input className="auth-input" placeholder="السؤال..." value={question} onChange={e => setQuestion(e.target.value)} autoFocus />
        {options.map((opt, i) => (
          <div key={i} style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
            <input className="auth-input" style={{ margin: 0, flex: 1 }} placeholder={`الخيار ${i + 1}`} value={opt} onChange={e => updateOption(i, e.target.value)} />
            {options.length > 2 && <X size={20} style={{ cursor: 'pointer', color: 'var(--text-secondary)', marginTop: 12 }} onClick={() => removeOption(i)} />}
          </div>
        ))}
        {options.length < 8 && <div onClick={addOption} style={{ cursor: 'pointer', color: 'var(--accent)', fontSize: 13, marginBottom: 12, display: 'flex', alignItems: 'center', gap: 4 }}><Plus size={16} /> اضافة خيار</div>}
        <div className="group-toggle" onClick={() => setMulti(!multi)} style={{ marginBottom: 16 }}>
          <div className="group-toggle-label">اختيار متعدد</div>
          <div className={`toggle-switch ${multi ? 'on' : ''}`} />
        </div>
        <div className="modal-actions">
          <button onClick={onClose} style={{ background: 'var(--bg-tertiary)', color: 'var(--text-primary)' }}>الغاء</button>
          <button onClick={create} style={{ background: 'var(--accent)', color: 'white' }}>انشاء</button>
        </div>
      </div>
    </div>
  );
}

export function PollDisplay({ poll, onVote }) {
  const { user } = useAuth();
  const totalVotes = poll.options.reduce((sum, o) => sum + (o.votes?.length || 0), 0);

  return (
    <div style={{ background: 'rgba(0,0,0,.1)', borderRadius: 8, padding: 12, margin: '4px 0' }}>
      <div style={{ fontWeight: 600, marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
        <BarChart3 size={16} color="var(--accent)" /> {poll.question}
      </div>
      {poll.options.map(opt => {
        const count = opt.votes?.length || 0;
        const pct = totalVotes > 0 ? Math.round((count / totalVotes) * 100) : 0;
        const myVote = opt.votes?.some(v => v.userId === user.id);
        return (
          <div key={opt.id} onClick={() => onVote(poll.id, opt.id)} style={{ cursor: 'pointer', marginBottom: 6, borderRadius: 6, overflow: 'hidden', position: 'relative', padding: '8px 12px', border: `1px solid ${myVote ? 'var(--accent)' : 'transparent'}` }}>
            <div style={{ position: 'absolute', top: 0, right: 0, bottom: 0, width: `${pct}%`, background: myVote ? 'rgba(0,168,132,.15)' : 'rgba(255,255,255,.05)', transition: 'width .3s' }} />
            <div style={{ position: 'relative', display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
              <span>{opt.text}</span>
              <span style={{ color: 'var(--text-secondary)' }}>{pct}% ({count})</span>
            </div>
          </div>
        );
      })}
      <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 4 }}>{totalVotes} صوت</div>
    </div>
  );
}
