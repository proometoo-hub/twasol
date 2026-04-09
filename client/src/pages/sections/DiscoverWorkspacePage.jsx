import { useEffect, useMemo, useRef, useState } from 'react';
import { post, remove } from '../../api/client';
import { formatRelativeDay, fullUrl, isImage, isVideo } from '../../utils/format';

const TEXT_PRESETS = [
  {
    id: 'midnight',
    labelAr: 'منتصف الليل',
    labelEn: 'Midnight',
    background: 'linear-gradient(135deg, #0f172a 0%, #1d4ed8 52%, #0ea5e9 100%)',
    textColor: '#ffffff',
    overlay: 'linear-gradient(180deg, rgba(0,0,0,0.18), rgba(0,0,0,0.45))',
  },
  {
    id: 'sunset',
    labelAr: 'غروب',
    labelEn: 'Sunset',
    background: 'linear-gradient(135deg, #7c2d12 0%, #ea580c 45%, #f59e0b 100%)',
    textColor: '#fff7ed',
    overlay: 'linear-gradient(180deg, rgba(0,0,0,0.12), rgba(0,0,0,0.35))',
  },
  {
    id: 'forest',
    labelAr: 'غابة',
    labelEn: 'Forest',
    background: 'linear-gradient(135deg, #052e16 0%, #166534 50%, #22c55e 100%)',
    textColor: '#ecfdf5',
    overlay: 'linear-gradient(180deg, rgba(0,0,0,0.12), rgba(0,0,0,0.38))',
  },
  {
    id: 'berry',
    labelAr: 'توتي',
    labelEn: 'Berry',
    background: 'linear-gradient(135deg, #581c87 0%, #9333ea 44%, #ec4899 100%)',
    textColor: '#fff1f2',
    overlay: 'linear-gradient(180deg, rgba(0,0,0,0.1), rgba(0,0,0,0.35))',
  },
  {
    id: 'cloud',
    labelAr: 'ضبابي',
    labelEn: 'Cloud',
    background: 'linear-gradient(135deg, #1f2937 0%, #374151 42%, #94a3b8 100%)',
    textColor: '#f8fafc',
    overlay: 'linear-gradient(180deg, rgba(0,0,0,0.16), rgba(0,0,0,0.28))',
  },
  {
    id: 'cream',
    labelAr: 'كريمي',
    labelEn: 'Cream',
    background: 'linear-gradient(135deg, #fef3c7 0%, #fcd34d 52%, #f59e0b 100%)',
    textColor: '#1f2937',
    overlay: 'linear-gradient(180deg, rgba(255,255,255,0.1), rgba(255,255,255,0.18))',
  },
];

const FONT_OPTIONS = [
  { value: 'Cairo, sans-serif', labelAr: 'كايرو', labelEn: 'Cairo' },
  { value: 'Tahoma, sans-serif', labelAr: 'تاهوما', labelEn: 'Tahoma' },
  { value: 'Arial, sans-serif', labelAr: 'آريال', labelEn: 'Arial' },
  { value: 'Georgia, serif', labelAr: 'جورجيا', labelEn: 'Georgia' },
  { value: 'Trebuchet MS, sans-serif', labelAr: 'تريبيوشيت', labelEn: 'Trebuchet' },
];

const TEXT_COLORS = ['#ffffff', '#f8fafc', '#fde68a', '#fca5a5', '#bfdbfe', '#d8b4fe', '#0f172a'];
const BG_SWATCHES = TEXT_PRESETS.map((preset) => preset.background);

const DEFAULT_TEXT_STYLE = {
  presetId: 'midnight',
  background: TEXT_PRESETS[0].background,
  textColor: TEXT_PRESETS[0].textColor,
  overlay: TEXT_PRESETS[0].overlay,
  fontFamily: FONT_OPTIONS[0].value,
  fontSize: 34,
  fontWeight: 700,
  textAlign: 'center',
  textShadow: true,
};

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

const mergeStatusStyle = (rawStyle = {}) => ({
  ...DEFAULT_TEXT_STYLE,
  ...(rawStyle || {}),
  fontSize: clamp(Number(rawStyle?.fontSize || DEFAULT_TEXT_STYLE.fontSize), 20, 52),
  fontWeight: clamp(Number(rawStyle?.fontWeight || DEFAULT_TEXT_STYLE.fontWeight), 500, 800),
});

const buildStatusVisual = ({ status, previewUrl = '', textOverride = '' }) => {
  const style = mergeStatusStyle(status?.style || status || {});
  const backgroundImageUrl = previewUrl || (status?.type === 'text' ? status?.mediaUrl : '');
  const background = backgroundImageUrl
    ? `${style.overlay}, url(${backgroundImageUrl.startsWith('blob:') ? backgroundImageUrl : fullUrl(backgroundImageUrl)}) center/cover`
    : style.background;

  return {
    wrapperStyle: {
      background,
      color: style.textColor,
      textAlign: style.textAlign,
      fontFamily: style.fontFamily,
    },
    textStyle: {
      fontFamily: style.fontFamily,
      fontSize: `clamp(1.15rem, 2vw, ${Math.max(1.4, style.fontSize / 16)}rem)`,
      fontWeight: style.fontWeight,
      textAlign: style.textAlign,
      color: style.textColor,
      textShadow: style.textShadow ? '0 8px 28px rgba(0,0,0,0.35)' : 'none',
    },
    content: textOverride || status?.text || '',
  };
};

function StatusCreateModal({ locale, open, onClose, onSubmit, busy }) {
  const fileRef = useRef(null);
  const [mode, setMode] = useState('text');
  const [text, setText] = useState('');
  const [file, setFile] = useState(null);
  const [style, setStyle] = useState(DEFAULT_TEXT_STYLE);
  const [previewUrl, setPreviewUrl] = useState('');

  useEffect(() => {
    if (!open) {
      setMode('text');
      setText('');
      setFile(null);
      setStyle(DEFAULT_TEXT_STYLE);
      if (fileRef.current) fileRef.current.value = '';
    }
  }, [open]);

  useEffect(() => {
    setFile(null);
    setPreviewUrl('');
    if (fileRef.current) fileRef.current.value = '';
  }, [mode]);

  useEffect(() => {
    if (!file || mode !== 'text') {
      setPreviewUrl('');
      return undefined;
    }
    const objectUrl = URL.createObjectURL(file);
    setPreviewUrl(objectUrl);
    return () => URL.revokeObjectURL(objectUrl);
  }, [file, mode]);

  if (!open) return null;

  const applyPreset = (preset) => {
    setStyle((current) => ({
      ...current,
      presetId: preset.id,
      background: preset.background,
      textColor: preset.textColor,
      overlay: preset.overlay,
    }));
  };

  const submit = async () => {
    await onSubmit({ mode, text, file, style });
  };

  const previewStatus = { type: 'text', text, style, mediaUrl: previewUrl };
  const visual = buildStatusVisual({ status: previewStatus, previewUrl, textOverride: text || (locale === 'ar' ? 'اكتب الحالة كما تريد أن تظهر.' : 'Write the status as you want it to appear.') });

  return (
    <div className="status-modal-backdrop" onClick={onClose}>
      <div className="status-modal-card rich-status-modal" onClick={(event) => event.stopPropagation()}>
        <div className="status-modal-top">
          <div>
            <strong>{locale === 'ar' ? 'إنشاء حالة جديدة' : 'Create a new status'}</strong>
            <span>{locale === 'ar' ? 'اختر النوع ثم خصّص شكل الحالة بشكل احترافي.' : 'Choose a type, then design the story with richer controls.'}</span>
          </div>
          <button type="button" className="icon-button" onClick={onClose} title={locale === 'ar' ? 'إغلاق' : 'Close'}>✕</button>
        </div>

        <div className="status-type-grid">
          <button type="button" className={`status-type-option ${mode === 'text' ? 'is-active' : ''}`} onClick={() => setMode('text')}>
            <span>✍</span>
            <strong>{locale === 'ar' ? 'نص' : 'Text'}</strong>
          </button>
          <button type="button" className={`status-type-option ${mode === 'image' ? 'is-active' : ''}`} onClick={() => setMode('image')}>
            <span>🖼</span>
            <strong>{locale === 'ar' ? 'صورة' : 'Image'}</strong>
          </button>
          <button type="button" className={`status-type-option ${mode === 'video' ? 'is-active' : ''}`} onClick={() => setMode('video')}>
            <span>🎬</span>
            <strong>{locale === 'ar' ? 'فيديو' : 'Video'}</strong>
          </button>
        </div>

        <div className="status-modal-body rich-status-grid">
          {mode === 'text' ? (
            <>
              <div className="status-design-panel">
                <textarea
                  value={text}
                  onChange={(event) => setText(event.target.value)}
                  className="status-modal-textarea rich"
                  placeholder={locale === 'ar' ? 'اكتب حالة نصية مميزة…' : 'Write a more artistic text status…'}
                  rows={7}
                />

                <div className="status-control-section">
                  <div className="status-control-title">{locale === 'ar' ? 'خلفيات جاهزة' : 'Preset backgrounds'}</div>
                  <div className="status-swatch-grid">
                    {TEXT_PRESETS.map((preset) => (
                      <button
                        key={preset.id}
                        type="button"
                        className={`status-swatch ${style.presetId === preset.id ? 'is-active' : ''}`}
                        style={{ background: preset.background }}
                        onClick={() => applyPreset(preset)}
                        title={locale === 'ar' ? preset.labelAr : preset.labelEn}
                      />
                    ))}
                  </div>
                </div>

                <div className="status-control-section two-column">
                  <label className="status-field-card">
                    <span>{locale === 'ar' ? 'لون الخط' : 'Text color'}</span>
                    <div className="status-color-row">
                      {TEXT_COLORS.map((color) => (
                        <button
                          key={color}
                          type="button"
                          className={`status-color-dot ${style.textColor === color ? 'is-active' : ''}`}
                          style={{ backgroundColor: color }}
                          onClick={() => setStyle((current) => ({ ...current, textColor: color }))}
                        />
                      ))}
                    </div>
                  </label>

                  <label className="status-field-card">
                    <span>{locale === 'ar' ? 'نوع الخط' : 'Font family'}</span>
                    <select
                      className="status-select"
                      value={style.fontFamily}
                      onChange={(event) => setStyle((current) => ({ ...current, fontFamily: event.target.value }))}
                    >
                      {FONT_OPTIONS.map((font) => (
                        <option key={font.value} value={font.value}>{locale === 'ar' ? font.labelAr : font.labelEn}</option>
                      ))}
                    </select>
                  </label>
                </div>

                <div className="status-control-section two-column">
                  <label className="status-field-card">
                    <span>{locale === 'ar' ? 'حجم الخط' : 'Font size'}</span>
                    <input
                      type="range"
                      min="20"
                      max="52"
                      value={style.fontSize}
                      onChange={(event) => setStyle((current) => ({ ...current, fontSize: Number(event.target.value) }))}
                    />
                    <small>{style.fontSize}px</small>
                  </label>

                  <label className="status-field-card">
                    <span>{locale === 'ar' ? 'سماكة الخط' : 'Weight'}</span>
                    <div className="status-pill-toggle-row">
                      {[500, 600, 700, 800].map((weight) => (
                        <button
                          key={weight}
                          type="button"
                          className={`status-pill-toggle ${style.fontWeight === weight ? 'is-active' : ''}`}
                          onClick={() => setStyle((current) => ({ ...current, fontWeight: weight }))}
                        >
                          {weight}
                        </button>
                      ))}
                    </div>
                  </label>
                </div>

                <div className="status-control-section two-column">
                  <label className="status-field-card">
                    <span>{locale === 'ar' ? 'محاذاة النص' : 'Text align'}</span>
                    <div className="status-pill-toggle-row">
                      {[
                        { value: 'right', label: locale === 'ar' ? 'يمين' : 'Right' },
                        { value: 'center', label: locale === 'ar' ? 'وسط' : 'Center' },
                        { value: 'left', label: locale === 'ar' ? 'يسار' : 'Left' },
                      ].map((item) => (
                        <button
                          key={item.value}
                          type="button"
                          className={`status-pill-toggle ${style.textAlign === item.value ? 'is-active' : ''}`}
                          onClick={() => setStyle((current) => ({ ...current, textAlign: item.value }))}
                        >
                          {item.label}
                        </button>
                      ))}
                    </div>
                  </label>

                  <label className="status-field-card">
                    <span>{locale === 'ar' ? 'لمسة فنية' : 'Artistic touch'}</span>
                    <div className="status-pill-toggle-row">
                      <button
                        type="button"
                        className={`status-pill-toggle ${style.textShadow ? 'is-active' : ''}`}
                        onClick={() => setStyle((current) => ({ ...current, textShadow: !current.textShadow }))}
                      >
                        {locale === 'ar' ? 'ظل للنص' : 'Text shadow'}
                      </button>
                    </div>
                  </label>
                </div>

                <div className="status-control-section">
                  <div className="status-field-card full-width">
                    <span>{locale === 'ar' ? 'صورة خلف النص (اختياري)' : 'Background image behind text (optional)'}</span>
                    <div className="status-file-inline-row">
                      <input
                        ref={fileRef}
                        type="file"
                        hidden
                        accept="image/*"
                        onChange={(event) => setFile(event.target.files?.[0] || null)}
                      />
                      <button type="button" className="ghost-button compact" onClick={() => fileRef.current?.click()}>
                        {locale === 'ar' ? 'اختيار صورة خلفية' : 'Choose background image'}
                      </button>
                      {file ? <button type="button" className="ghost-button compact" onClick={() => { setFile(null); if (fileRef.current) fileRef.current.value = ''; }}>{locale === 'ar' ? 'إزالة' : 'Remove'}</button> : null}
                    </div>
                    <small>{file ? file.name : (locale === 'ar' ? 'يمكنك دمج صورة ناعمة مع النص.' : 'You can blend a soft image behind the text.')}</small>
                  </div>
                </div>
              </div>

              <div className="status-preview-panel">
                <div className="status-preview-topbar">
                  <strong>{locale === 'ar' ? 'معاينة مباشرة' : 'Live preview'}</strong>
                  <span>{locale === 'ar' ? 'هكذا ستظهر الحالة تقريبًا' : 'This is how your status will appear'}</span>
                </div>
                <div className="status-text-canvas" style={visual.wrapperStyle}>
                  <div className="status-text-canvas-overlay" />
                  <div className="status-text-canvas-content" style={visual.textStyle}>{visual.content}</div>
                </div>
              </div>
            </>
          ) : (
            <div className="status-file-picker-box only-uploader">
              <input
                ref={fileRef}
                type="file"
                hidden
                accept={mode === 'image' ? 'image/*' : 'video/*'}
                onChange={(event) => setFile(event.target.files?.[0] || null)}
              />
              <button type="button" className="ghost-button compact" onClick={() => fileRef.current?.click()}>
                {mode === 'image' ? (locale === 'ar' ? 'اختيار صورة' : 'Choose image') : (locale === 'ar' ? 'اختيار فيديو' : 'Choose video')}
              </button>
              <div className="status-file-picker-note">
                {file
                  ? `${locale === 'ar' ? 'الملف المحدد:' : 'Selected file:'} ${file.name}`
                  : (locale === 'ar' ? 'لم يتم اختيار ملف بعد.' : 'No file selected yet.')}
              </div>
              <textarea
                value={text}
                onChange={(event) => setText(event.target.value)}
                className="status-modal-textarea compact"
                placeholder={locale === 'ar' ? 'أضف وصفًا اختياريًا...' : 'Add an optional caption...'}
                rows={4}
              />
            </div>
          )}
        </div>

        <div className="status-modal-actions">
          <button type="button" className="ghost-button compact" onClick={onClose}>{locale === 'ar' ? 'إلغاء' : 'Cancel'}</button>
          <button
            type="button"
            className="primary-button"
            disabled={busy || ((mode === 'text' && !text.trim()) || (mode !== 'text' && !file))}
            onClick={submit}
          >
            {busy ? '…' : (locale === 'ar' ? 'نشر الحالة' : 'Post status')}
          </button>
        </div>
      </div>
    </div>
  );
}

function StatusStoryChip({ locale, status, onOpen }) {
  const kindLabel = status.type === 'text'
    ? (locale === 'ar' ? 'نص مخصص' : 'Styled text')
    : (isVideo(status.mediaUrl, status.mediaMime) ? (locale === 'ar' ? 'فيديو' : 'Video') : (locale === 'ar' ? 'صورة' : 'Image'));

  const visual = buildStatusVisual({ status, textOverride: status.text || (locale === 'ar' ? 'حالة نصية' : 'Text story') });

  return (
    <button type="button" className={`status-story-chip ${status.viewed ? 'is-viewed' : ''}`} onClick={onOpen}>
      {status.type === 'text' ? (
        <div className="status-story-preview" style={visual.wrapperStyle}>
          <div className="status-story-preview-overlay" />
          <div className="status-story-preview-text" style={visual.textStyle}>{status.text || (locale === 'ar' ? 'نص' : 'Text')}</div>
        </div>
      ) : (
        <div className="status-story-ring">
          <div className="status-story-avatar">{(status.displayName || '?').slice(0, 1)}</div>
        </div>
      )}
      <div className="status-story-copy">
        <strong>{status.isMine ? (locale === 'ar' ? 'حالتي' : 'My status') : status.displayName}</strong>
        <span>{kindLabel}</span>
      </div>
    </button>
  );
}

function StatusViewer({ locale, statuses, index, onClose, onDelete, onToggleMute, onViewed }) {
  const current = statuses[index] || null;
  const videoRef = useRef(null);
  const [mediaFailed, setMediaFailed] = useState(false);

  useEffect(() => {
    setMediaFailed(false);
    if (!current) return undefined;
    if (onViewed && !current.viewed) onViewed(current);
    if (!current.mediaUrl || current.type === 'text' || !isVideo(current.mediaUrl, current.mediaMime) || !videoRef.current) return undefined;
    const video = videoRef.current;
    video.muted = false;
    video.volume = 1;
    const promise = video.play();
    if (promise?.catch) promise.catch(() => {});
    return () => video.pause();
  }, [current, onViewed]);

  useEffect(() => {
    if (!current) return undefined;
    const handleKey = (event) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [current, onClose]);

  if (!current) return null;

  const canPrev = index > 0;
  const canNext = index < statuses.length - 1;
  const visual = buildStatusVisual({ status: current });

  return (
    <div className="status-viewer-backdrop modern" onClick={onClose}>
      <div className="status-viewer-card pro modern" onClick={(event) => event.stopPropagation()}>
        <div className="status-viewer-progress-strip">
          {statuses.map((statusItem, statusIndex) => (
            <button
              key={statusItem.id}
              type="button"
              className={`status-viewer-progress ${statusIndex === index ? 'is-active' : ''} ${statusIndex < index ? 'is-done' : ''}`}
              onClick={() => onViewed(statusItem, statusIndex)}
              aria-label={statusItem.displayName}
            />
          ))}
        </div>

        <div className="status-viewer-topbar modern">
          <div className="status-viewer-actions">
            {current.isMine ? (
              <button type="button" className="icon-button subtle-danger" onClick={() => onDelete(current)} title={locale === 'ar' ? 'حذف' : 'Delete'}>🗑</button>
            ) : (
              <button type="button" className="icon-button" onClick={() => onToggleMute(current)} title={current.muted ? (locale === 'ar' ? 'إلغاء الكتم' : 'Unmute') : (locale === 'ar' ? 'كتم' : 'Mute')}>
                {current.muted ? '🔔' : '🔕'}
              </button>
            )}
            <button type="button" className="icon-button" onClick={onClose} title={locale === 'ar' ? 'إغلاق' : 'Close'}>✕</button>
          </div>
          <div className="status-viewer-author">
            <div>
              <strong>{current.displayName}</strong>
              <span>{formatRelativeDay(current.createdAt)}</span>
            </div>
            <div className="status-viewer-avatar">{(current.displayName || '?').slice(0, 1)}</div>
          </div>
        </div>

        <div className="status-viewer-body modern">
          {canPrev ? <button type="button" className="status-viewer-nav prev" onClick={() => onViewed(statuses[index - 1], index - 1)}>‹</button> : <span />}

          <div className="status-viewer-stage">
            {current.type === 'text' ? (
              <div className="status-viewer-text-scene modern" style={visual.wrapperStyle}>
                <div className="status-viewer-text-scene-overlay" />
                <div className="status-viewer-text-scene-content" style={visual.textStyle}>{current.text}</div>
              </div>
            ) : current.mediaUrl ? (
              isVideo(current.mediaUrl, current.mediaMime) ? (
                <video
                  ref={videoRef}
                  src={fullUrl(current.mediaUrl)}
                  className="status-viewer-media modern"
                  controls
                  autoPlay
                  playsInline
                  preload="metadata"
                  onError={() => setMediaFailed(true)}
                />
              ) : (
                <img
                  src={fullUrl(current.mediaUrl)}
                  alt={current.text || 'status'}
                  className="status-viewer-media modern"
                  onError={() => setMediaFailed(true)}
                />
              )
            ) : (
              <div className="status-viewer-placeholder modern">{current.text}</div>
            )}

            {current.type !== 'text' && current.text ? <div className="status-viewer-caption modern">{current.text}</div> : null}
            {mediaFailed ? <div className="status-viewer-caption error modern">{locale === 'ar' ? 'تعذر تحميل هذه الحالة.' : 'Could not load this status.'}</div> : null}
          </div>

          {canNext ? <button type="button" className="status-viewer-nav next" onClick={() => onViewed(statuses[index + 1], index + 1)}>›</button> : <span />}
        </div>
      </div>
    </div>
  );
}

export default function DiscoverWorkspacePage({ locale, statuses, conversations, openConversation, onRefresh, currentUser, refreshing, coreError }) {
  const [busy, setBusy] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [viewerCollection, setViewerCollection] = useState([]);
  const [viewerIndex, setViewerIndex] = useState(0);

  const mediaRows = conversations.filter((item) => item.lastMessageType && item.lastMessageType !== 'text').slice(0, 6);
  const myStatuses = useMemo(() => statuses.filter((item) => item.isMine), [statuses]);
  const othersStatuses = useMemo(() => statuses.filter((item) => !item.isMine), [statuses]);

  const openViewer = async (status, collection) => {
    try {
      const refreshed = await onRefresh();
      const list = (collection === 'mine' ? refreshed?.statuses?.filter((item) => item.isMine) : refreshed?.statuses?.filter((item) => !item.isMine)) || [];
      const foundIndex = list.findIndex((item) => item.id === status.id);
      setViewerCollection(list.length ? list : (collection === 'mine' ? myStatuses : othersStatuses));
      setViewerIndex(foundIndex >= 0 ? foundIndex : 0);
    } catch {
      const list = collection === 'mine' ? myStatuses : othersStatuses;
      const foundIndex = list.findIndex((item) => item.id === status.id);
      setViewerCollection(list);
      setViewerIndex(foundIndex >= 0 ? foundIndex : 0);
    }
  };

  const markViewed = async (status, forcedIndex = null) => {
    if (typeof forcedIndex === 'number') setViewerIndex(forcedIndex);
    if (!status || status.viewed) return;
    try {
      await post(`/api/statuses/${status.id}/view`, {});
      await onRefresh();
    } catch {}
  };

  const submitStatus = async ({ mode, text, file, style }) => {
    if (mode === 'text' && !text.trim()) return;
    if (mode !== 'text' && !file) return;

    setBusy(true);
    try {
      const form = new FormData();
      if (text.trim()) form.append('text', text.trim());
      if (file) form.append('file', file);
      if (mode === 'text') form.append('style', JSON.stringify(style));
      form.append('type', mode === 'video' ? 'video' : (mode === 'image' ? 'media' : 'text'));
      await post('/api/statuses', form);
      setCreateOpen(false);
      await onRefresh();
    } catch (error) {
      window.alert(error?.message || (locale === 'ar' ? 'تعذر نشر الحالة.' : 'Could not publish status.'));
    } finally {
      setBusy(false);
    }
  };

  const deleteStatus = async (status) => {
    const ok = window.confirm(locale === 'ar' ? 'هل تريد حذف هذه الحالة؟' : 'Delete this status?');
    if (!ok) return;
    await remove(`/api/statuses/${status.id}`);
    setViewerCollection((current) => current.filter((item) => item.id !== status.id));
    setViewerIndex(0);
    await onRefresh();
  };

  const toggleMute = async (status) => {
    if (status.muted) await remove(`/api/statuses/mute/${status.userId}`);
    else await post(`/api/statuses/mute/${status.userId}`, {});
    setViewerCollection([]);
    await onRefresh();
  };

  const statusState = (() => {
    if (refreshing) return { type: 'loading', text: locale === 'ar' ? 'جاري تحميل الحالات…' : 'Loading statuses…' };
    if (coreError) return { type: 'error', text: locale === 'ar' ? 'تعذر تحميل الحالات أو الاتصال بالخادم.' : 'Could not load statuses or reach the server.' };
    if (!myStatuses.length && !othersStatuses.length) return { type: 'empty', text: locale === 'ar' ? 'لا توجد حالات الآن. اضغط زر الإضافة لنشر أول حالة.' : 'No statuses yet. Tap the add button to post one.' };
    return null;
  })();

  return (
    <>
      <div className="discover-layout status-stories-page">
        <section className="card minimal-page-card status-toolbar-card">
          <div className="status-toolbar-copy">
            <span className="page-kicker">{locale === 'ar' ? 'الحالة' : 'Status'}</span>
            <h2>{locale === 'ar' ? 'الحالات صارت على شكل شريط واضح وخفيف' : 'Statuses are now a cleaner story rail'}</h2>
            <p>{locale === 'ar' ? 'كل حالة بجانب الأخرى في شريط أفقي، مع إضافة احترافية من زر واحد بدل أخذ مساحة كبيرة من الصفحة.' : 'Every status sits in a horizontal rail, with a compact creation flow from one button.'}</p>
          </div>
          <button type="button" className="status-add-fab" onClick={() => setCreateOpen(true)} title={locale === 'ar' ? 'إضافة حالة' : 'Add status'}>
            <span>＋</span>
            <strong>{locale === 'ar' ? 'إضافة حالة' : 'Add status'}</strong>
          </button>
        </section>

        <section className="card minimal-page-card status-strip-card">
          <div className="minimal-page-head-row compact-head">
            <div>
              <strong>{locale === 'ar' ? 'حالتي' : 'My stories'}</strong>
              <span>{locale === 'ar' ? 'مرر أفقيًا لعرض كل ما نشرته.' : 'Scroll horizontally to see everything you posted.'}</span>
            </div>
          </div>

          {statusState?.type === 'error' ? (
            <div className="status-empty-pro error">{statusState.text}</div>
          ) : (
            <div className="status-story-strip" dir="rtl">
              <button type="button" className="status-add-story-tile" onClick={() => setCreateOpen(true)}>
                <div className="status-add-story-circle">＋</div>
                <strong>{locale === 'ar' ? 'إضافة' : 'Add'}</strong>
                <span>{locale === 'ar' ? 'صورة / فيديو / نص' : 'Photo / video / text'}</span>
              </button>

              {myStatuses.map((status) => (
                <StatusStoryChip key={status.id} locale={locale} status={status} onOpen={() => openViewer(status, 'mine')} />
              ))}

              {!myStatuses.length && statusState?.type !== 'loading' ? (
                <div className="status-inline-empty">{locale === 'ar' ? 'لا توجد لديك حالات بعد.' : 'No statuses yet.'}</div>
              ) : null}
            </div>
          )}
        </section>

        <section className="card minimal-page-card status-strip-card">
          <div className="minimal-page-head-row compact-head">
            <div>
              <strong>{locale === 'ar' ? 'حالات الآخرين' : "Others' stories"}</strong>
              <span>{locale === 'ar' ? 'كل حالة بجانب الأخرى مع تمرير أفقي سلس.' : 'Each status sits beside the next with smooth horizontal scrolling.'}</span>
            </div>
          </div>

          {statusState?.type === 'loading' ? (
            <div className="status-inline-empty">{statusState.text}</div>
          ) : (
            <div className="status-story-strip" dir="rtl">
              {othersStatuses.map((status) => (
                <StatusStoryChip key={status.id} locale={locale} status={status} onOpen={() => openViewer(status, 'others')} />
              ))}
              {!othersStatuses.length ? (
                <div className="status-inline-empty">{statusState?.type === 'empty' ? statusState.text : (locale === 'ar' ? 'لا توجد حالات جديدة من الآخرين.' : 'No new statuses from others.')}</div>
              ) : null}
            </div>
          )}
        </section>

        <section className="card minimal-page-card shared-media-panel compact">
          <div className="minimal-page-head-row compact-head">
            <div>
              <strong>{locale === 'ar' ? 'وسائط حديثة من المحادثات' : 'Recent media from chats'}</strong>
              <span>{locale === 'ar' ? 'اختصارات سريعة للعودة إلى أصل الوسائط.' : 'Quick shortcuts back to the original media.'}</span>
            </div>
          </div>
          <div className="shared-media-grid compact-media-grid compact-status-media-grid">
            {mediaRows.map((conversation) => (
              <button key={conversation.id} type="button" className="shared-media-card compact" onClick={() => openConversation(conversation.id)}>
                <div className="shared-media-card-head">
                  <strong>{conversation.title}</strong>
                  <span>{conversation.lastMessageType}</span>
                </div>
                <div className="shared-media-card-foot">{conversation.lastMessageText || conversation.description || conversation.type}</div>
              </button>
            ))}
            {!mediaRows.length ? <div className="status-inline-empty">{locale === 'ar' ? 'لا توجد وسائط حديثة.' : 'No recent media.'}</div> : null}
          </div>
        </section>
      </div>

      <StatusCreateModal locale={locale} open={createOpen} onClose={() => setCreateOpen(false)} onSubmit={submitStatus} busy={busy} />
      <StatusViewer
        locale={locale}
        statuses={viewerCollection}
        index={viewerIndex}
        onClose={() => setViewerCollection([])}
        onDelete={deleteStatus}
        onToggleMute={toggleMute}
        onViewed={markViewed}
      />
    </>
  );
}
