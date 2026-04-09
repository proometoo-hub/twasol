import { useEffect, useMemo, useState } from 'react';
import { post } from '../api/client';
import { t } from '../i18n/strings';
import Avatar from './Avatar';

export default function NewConversationModal({ open, preset, joinCode, onClose, onCreated, users, locale }) {
  const [mode, setMode] = useState('direct');
  const [query, setQuery] = useState('');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [selected, setSelected] = useState([]);

  useEffect(() => {
    if (!open) return;
    if (preset) setMode(preset);
    if (preset === 'join' && joinCode) setQuery(joinCode);
  }, [open, preset, joinCode]);

  const filteredUsers = useMemo(() => users.filter((user) => `${user.displayName} ${user.username} ${user.email || ''} ${user.phone || ''}`.toLowerCase().includes(query.toLowerCase())), [users, query]);

  if (!open) return null;

  const reset = () => {
    setSelected([]);
    setTitle('');
    setDescription('');
    setQuery('');
  };

  const toggle = (id) => {
    setSelected((current) => {
      if (mode === 'direct') return [id];
      return current.includes(id) ? current.filter((item) => item !== id) : [...current, id];
    });
  };

  const createConversation = async () => {
    if (mode === 'join') {
      const data = await post(`/api/conversations/join/${query.trim()}`, {});
      onCreated(data.conversation);
      onClose();
      reset();
      return;
    }
    if (mode === 'direct') {
      if (!selected[0]) return;
      const data = await post('/api/conversations/direct', { userId: selected[0] });
      onCreated(data.conversation);
      onClose();
      reset();
      return;
    }
    const data = await post('/api/conversations', { type: mode, title, description, memberIds: selected });
    onCreated(data.conversation);
    onClose();
    reset();
  };

  return (
    <div className="modal-backdrop" onClick={() => { reset(); onClose(); }}>
      <div className="modal-card polished-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <div>
            <span className="eyebrow">{t(locale, 'quickActions')}</span>
            <h3>{t(locale, 'create')}</h3>
          </div>
          <button type="button" className="ghost-button compact" onClick={() => { reset(); onClose(); }}>{t(locale, 'cancel')}</button>
        </div>

        <div className="toggle-row segmented">
          {['direct', 'group', 'channel', 'join'].map((item) => (
            <button key={item} className={mode === item ? 'is-active' : ''} type="button" onClick={() => setMode(item)}>
              {item === 'join' ? t(locale, 'joinWithCode') : t(locale, item)}
            </button>
          ))}
        </div>

        {mode === 'join' ? (
          <label>
            <span>{t(locale, 'inviteCode')}</span>
            <input value={query} onChange={(e) => setQuery(e.target.value)} />
          </label>
        ) : (
          <>
            {mode !== 'direct' && (
              <div className="split-grid two-cols">
                <label>
                  <span>{t(locale, 'title')}</span>
                  <input value={title} onChange={(e) => setTitle(e.target.value)} />
                </label>
                <label>
                  <span>{t(locale, 'description')}</span>
                  <input value={description} onChange={(e) => setDescription(e.target.value)} />
                </label>
              </div>
            )}

            <label>
              <span>{t(locale, 'participants')}</span>
              <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t(locale, 'sidebarSearch')} />
            </label>

            <div className="selection-list polished-selection-list">
              {filteredUsers.map((user) => (
                <label key={user.id} className="selection-item polished-selection-item">
                  <input type={mode === 'direct' ? 'radio' : 'checkbox'} checked={selected.includes(user.id)} onChange={() => toggle(user.id)} />
                  <Avatar src={user.avatarUrl} name={user.displayName} size={44} />
                  <div>
                    <strong>{user.displayName}</strong>
                    <span>@{user.username}</span>
                  </div>
                </label>
              ))}
            </div>
          </>
        )}

        <button className="primary-button wide" type="button" onClick={createConversation}>{mode === 'join' ? t(locale, 'joinWithCode') : t(locale, 'create')}</button>
      </div>
    </div>
  );
}
