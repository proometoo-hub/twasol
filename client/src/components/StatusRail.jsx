import { useRef, useState } from 'react';
import { post, remove } from '../api/client';
import { t } from '../i18n/strings';
import { formatRelativeDay, fullUrl, isVideo } from '../utils/format';
import Avatar from './Avatar';

export default function StatusRail({ locale, statuses, onRefresh, currentUser, mobileSection }) {
  const fileRef = useRef(null);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (file) => {
    setBusy(true);
    try {
      const form = new FormData();
      if (text.trim()) form.append('text', text.trim());
      if (file) form.append('file', file);
      form.append('type', file ? 'media' : 'text');
      await post('/api/statuses', form);
      setText('');
      if (fileRef.current) fileRef.current.value = '';
      await onRefresh();
    } finally {
      setBusy(false);
    }
  };

  const viewStatus = async (status) => {
    if (!status.viewed) await post(`/api/statuses/${status.id}/view`, {});
  };

  const toggleMute = async (status) => {
    if (status.muted) await remove(`/api/statuses/mute/${status.userId}`);
    else await post(`/api/statuses/mute/${status.userId}`, {});
    await onRefresh();
  };

  return (
    <section className={`status-rail card ${mobileSection === 'statuses' ? 'focus-mobile' : ''}`}>
      <div className="section-header">
        <div>
          <span className="eyebrow">{t(locale, 'statusCenter')}</span>
          <h3>{t(locale, 'statuses')}</h3>
        </div>
        <button type="button" className="ghost-button compact" onClick={() => submit()} disabled={busy || !text.trim()}>{t(locale, 'addStatus')}</button>
      </div>

      <div className="status-composer-box frosted-box">
        <Avatar src={currentUser?.avatarUrl} name={currentUser?.displayName} size={48} />
        <div className="status-create-fields">
          <input value={text} onChange={(e) => setText(e.target.value)} placeholder={t(locale, 'createStatusHint')} />
          <div className="status-create-actions">
            <label className="ghost-button compact file-trigger">
              📎
              <input ref={fileRef} type="file" hidden onChange={(e) => e.target.files?.[0] && submit(e.target.files[0])} />
            </label>
            <span className="mini-note">{t(locale, 'createStatusHint')}</span>
          </div>
        </div>
      </div>

      <div className="status-list enhanced-status-list">
        {statuses.map((status) => (
          <article className="status-card" key={status.id}>
            <div className="status-card-top">
              <div className="status-headline">
                <Avatar src={status.avatarUrl} name={status.displayName} size={42} />
                <div>
                  <strong>{status.displayName}</strong>
                  <span>{formatRelativeDay(status.createdAt)}</span>
                </div>
              </div>
              {!status.isMine && (
                <button type="button" className="ghost-inline" onClick={() => toggleMute(status)}>
                  {status.muted ? t(locale, 'unmuteStatus') : t(locale, 'muteStatus')}
                </button>
              )}
            </div>

            <button type="button" className="status-card-button" onClick={() => viewStatus(status)}>
              <div className="status-text-clamp">{status.text || status.type}</div>
              {status.mediaUrl && (
                isVideo(status.mediaUrl, status.mediaMime)
                  ? <video controls src={fullUrl(status.mediaUrl)} className="status-preview wide" />
                  : <img src={fullUrl(status.mediaUrl)} alt="status" className="status-preview wide" />
              )}
            </button>

            <div className="status-card-footer">
              <span>{status.viewsCount} {t(locale, 'viewed')}</span>
              <span className={`tiny-pill ${status.viewed ? 'success' : ''}`}>{status.viewed ? '✓' : '•'}</span>
            </div>
          </article>
        ))}

        {!statuses.length && (
          <div className="empty-state enhanced-empty status-empty">
            <div className="empty-illustration">⭕</div>
            <strong>{t(locale, 'noStatuses')}</strong>
            <span>{t(locale, 'createStatusHint')}</span>
          </div>
        )}
      </div>
    </section>
  );
}
