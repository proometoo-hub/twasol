import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { Send, Phone, Video, Smile, Paperclip, Reply, Trash2, X, FileText, Play, Pause, Check, CheckCheck, Mic, ArrowRight, SmilePlus, Forward, Pin, Search as SearchIcon, Download, ChevronDown, Shield, VolumeX, ImageOff, MicOff, Ban, Tags, CheckSquare, Square, Copy, Pencil, Clock3, Image as ImageIcon, Film, Music2, Link2, Globe2, Inbox, ChevronLeft, ChevronRight, ExternalLink, Youtube, Instagram, Music4, FileBadge2, MonitorPlay, Clapperboard, Megaphone, BadgeCheck, Languages, Loader2 } from 'lucide-react';
import { API_URL, buildAssetUrl } from '../api';
import api from '../api';
import { useAuth } from '../context/AuthContext';
import { useChat } from '../context/ChatContext';
import { useSocket } from '../context/SocketContext';
import useRecorder from '../hooks/useRecorder';
import EmojiPicker from './EmojiPicker';
import ForwardModal from './ForwardModal';
import MessageSearch from './MessageSearch';
import { ScheduleMessage, ScheduledMessagesManager } from './SmallModals';
import Avatar from './Avatar';
import { useLanguage } from '../context/LanguageContext';

const QUICK_REACTIONS = ['❤️','😂','👍','😮','😢','🔥'];

const inferAttachmentKind = (file) => {
  if (!file) return 'file';
  if (file.type?.startsWith('image/')) return 'image';
  if (file.type?.startsWith('video/')) return 'video';
  if (file.type?.startsWith('audio/')) return 'voice';
  return 'file';
};

const attachmentSummary = (item) => {
  if (!item) return 'مرفق';
  if (item.text) return item.text;
  if (item.fileName) return item.fileName;
  if (item.type === 'image') return 'صورة';
  if (item.type === 'video') return 'فيديو';
  if (item.type === 'voice') return 'رسالة صوتية';
  return 'مرفق';
};

const AttachmentTypeIcon = ({ type, size = 16 }) => {
  if (type === 'image') return <ImageIcon size={size} />;
  if (type === 'video') return <Film size={size} />;
  if (type === 'voice') return <Music2 size={size} />;
  return <FileText size={size} />;
};

const extractUrls = (value = '') => {
  const matches = value.match(/https?:\/\/[^\s]+/g) || [];
  return Array.from(new Set(matches)).slice(0, 3);
};

const getUrlMeta = (rawUrl) => {
  try {
    const url = new URL(rawUrl);
    const hostname = url.hostname.replace(/^www\./, '');
    const pathname = url.pathname && url.pathname !== '/' ? decodeURIComponent(url.pathname).slice(0, 60) : '';
    const lowerHost = hostname.toLowerCase();
    const lowerHref = url.toString().toLowerCase();
    let kind = 'website';
    let label = 'رابط ويب';
    if (lowerHost.includes('youtube.com') || lowerHost.includes('youtu.be')) { kind = 'youtube'; label = 'YouTube'; }
    else if (lowerHost.includes('instagram.com')) { kind = 'instagram'; label = 'Instagram'; }
    else if (lowerHost.includes('tiktok.com')) { kind = 'tiktok'; label = 'TikTok'; }
    else if (lowerHost.includes('x.com') || lowerHost.includes('twitter.com')) { kind = 'x'; label = 'X / Twitter'; }
    else if (lowerHost.includes('github.com')) { kind = 'github'; label = 'GitHub'; }
    else if (lowerHref.endsWith('.pdf')) { kind = 'pdf'; label = 'PDF'; }
    else if (/\.(png|jpe?g|gif|webp)$/i.test(lowerHref)) { kind = 'image'; label = 'صورة'; }
    else if (/\.(mp4|mov|webm|mkv)$/i.test(lowerHref)) { kind = 'video'; label = 'فيديو'; }
    let title = pathname || url.searchParams.get('v') || hostname;
    title = title.replace(/^\/+/, '').replace(/[-_]/g, ' ').slice(0, 70) || 'فتح الرابط';
    return { hostname, pathname, href: url.toString(), kind, label, title };
  } catch {
    return null;
  }
};

function LinkPreviewCard({ url }) {
  const meta = getUrlMeta(url);
  if (!meta) return null;
  const Icon = meta.kind === 'youtube' ? Youtube : meta.kind === 'instagram' ? Instagram : meta.kind === 'tiktok' ? Music4 : meta.kind === 'pdf' ? FileBadge2 : meta.kind === 'video' ? MonitorPlay : meta.kind === 'image' ? ImageIcon : Globe2;
  return (
    <a href={meta.href} target="_blank" rel="noreferrer" className={`link-preview-card kind-${meta.kind}`}>
      <div className="link-preview-icon"><Icon size={16} /></div>
      <div className="link-preview-content">
        <div className="link-preview-topline">
          <span className="link-preview-badge">{meta.label}</span>
          <span className="link-preview-host">{meta.hostname}</span>
        </div>
        <div className="link-preview-title">{meta.title}</div>
        <div className="link-preview-path">{meta.pathname || 'فتح الرابط في تبويب جديد'}</div>
      </div>
      <ExternalLink size={14} className="link-preview-arrow" />
    </a>
  );
}

function SystemMessageCard({ message }) {
  const body = message?.text || message?.fileName || 'إجراء نظام';
  return (
    <div className="system-message-card">
      <div className="system-message-badge">رسالة نظام</div>
      <div className="system-message-body">{body}</div>
    </div>
  );
}

function TranslationPanel({ prefs, setPrefs, onClose, onTranslateDraft, translatingDraft, t }) {
  const languages = [
    ['auto','تلقائي'], ['ar','العربية'], ['en','English'], ['tr','Türkçe'], ['fr','Français'], ['es','Español'], ['de','Deutsch'], ['ru','Русский'], ['fa','فارسی'], ['ur','اردو'], ['hi','हिन्दी']
  ];
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()} style={{ width: 'min(92vw, 440px)', textAlign: 'right' }}>
        <h3 style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}><Languages size={18} /> {t('language')}</h3>
        <div style={{ display: 'grid', gap: 12 }}>
          <label style={{ display: 'grid', gap: 6 }}>
            <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>Source language</span>
            <select className="chat-input" value={prefs.sourceLang} onChange={e => setPrefs(v => ({ ...v, sourceLang: e.target.value }))}>
              {languages.map(([value,label]) => <option key={value} value={value}>{label}</option>)}
            </select>
          </label>
          <label style={{ display: 'grid', gap: 6 }}>
            <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>Target language</span>
            <select className="chat-input" value={prefs.targetLang} onChange={e => setPrefs(v => ({ ...v, targetLang: e.target.value }))}>
              {languages.filter(([value]) => value !== 'auto').map(([value,label]) => <option key={value} value={value}>{label}</option>)}
            </select>
          </label>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13 }}>
            <input type="checkbox" checked={prefs.autoTranslateBeforeSend} onChange={e => setPrefs(v => ({ ...v, autoTranslateBeforeSend: e.target.checked }))} />
            Auto translate before sending
          </label>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13 }}>
            <input type="checkbox" checked={prefs.keepOriginal} onChange={e => setPrefs(v => ({ ...v, keepOriginal: e.target.checked }))} />
            Keep original with translation
          </label>
          <button className="secondary-btn" onClick={onTranslateDraft} disabled={translatingDraft} style={{ justifyContent: 'center' }}>
            {translatingDraft ? <Loader2 size={16} className="spin" /> : <Languages size={16} />} {t('language')}
          </button>
        </div>
        <div className="modal-actions" style={{ marginTop: 14 }}>
          <button onClick={onClose}>{t('close')}</button>
        </div>
      </div>
    </div>
  );
}

function TranscriptBlock({ state, onTranscribe }) {
  return (
    <div className="transcript-block">
      <button type="button" className="attachment-link attachment-link-button" onClick={onTranscribe} disabled={state.loading}>
        {state.loading ? <Loader2 size={14} className="spin" /> : <FileText size={14} />} {state.loading ? 'جاري التفريغ...' : 'تحويل إلى نص'}
      </button>
      {!!state.error && <div className="transcript-error">{state.error}</div>}
      {!!state.text && <div className="transcript-text">{state.text}</div>}
    </div>
  );
}

function VoicePlayer({ url }) {
  const audioRef = useRef(null);
  const [playing, setPlaying] = useState(false);
  const toggle = () => {
    if (!audioRef.current) return;
    if (playing) audioRef.current.pause();
    else audioRef.current.play();
    setPlaying(!playing);
  };
  return (
    <div className="voice-player">
      <audio ref={audioRef} src={url} onEnded={() => setPlaying(false)} />
      <button className="voice-btn" onClick={toggle}>{playing ? <Pause size={16} /> : <Play size={16} />}</button>
      <div className="voice-bar" />
      <a href={url} target="_blank" rel="noreferrer" className="voice-download"><Download size={14} /></a>
    </div>
  );
}

function PinnedMessagesPanel({ conversationId, onClose, onSelectMessage }) {
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const r = await api.get(`/messages/${conversationId}/pinned`);
        if (mounted) setMessages(r.data);
      } catch {} finally { if (mounted) setLoading(false); }
    })();
    return () => { mounted = false; };
  }, [conversationId]);

  return (
    <div style={{ position: 'absolute', inset: 0, background: 'var(--bg-primary)', zIndex: 52, display: 'flex', flexDirection: 'column' }}>
      <div className="chat-header">
        <div className="chat-header-info">
          <ArrowRight size={20} style={{ cursor: 'pointer' }} onClick={onClose} />
          <div>
            <div className="name">الرسائل المثبتة</div>
            <div className="status">{messages.length} رسالة</div>
          </div>
        </div>
      </div>
      <div style={{ flex: 1, overflowY: 'auto' }}>
        {loading && <div style={{ textAlign: 'center', padding: 20, color: 'var(--text-secondary)' }}>جاري التحميل...</div>}
        {!loading && messages.length === 0 && <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-secondary)' }}>لا توجد رسائل مثبتة</div>}
        {messages.map(m => (
          <div key={m.id} className="pinned-item" onClick={() => { onSelectMessage?.(m.id); onClose(); }}>
            <div className="pinned-item-head">
              <span>{m.sender?.name || 'مستخدم'}</span>
              <span>{new Date(m.createdAt).toLocaleDateString('ar')}</span>
            </div>
            <div className="pinned-item-body">{m.text || m.fileName || 'مرفق'}</div>
          </div>
        ))}
      </div>
    </div>
  );
}


function QuickMemberPanel({ member, conversationId, canManage, onClose, onRefresh }) {
  const [busy, setBusy] = useState(false);

  if (!member) return null;

  const act = async (fn) => {
    setBusy(true);
    try { await fn(); await onRefresh?.(); } catch {} finally { setBusy(false); }
  };

  const setTag = async () => {
    const nextTag = window.prompt('أدخل وصفًا داخليًا قصيرًا لهذا العضو', member.tag || '');
    if (nextTag === null) return;
    await act(() => api.put(`/room-admin/${conversationId}/members/${member.userId}/tag`, { tag: nextTag }));
  };

  const toggleBan = async () => {
    const reason = member.isBanned ? '' : (window.prompt('سبب الحظر داخل هذه المجموعة فقط', member.bannedReason || '') || '');
    await act(() => api.put(`/room-admin/${conversationId}/members/${member.userId}/ban`, { banned: !member.isBanned, reason }));
    if (!member.isBanned) onClose?.();
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()} style={{ width: 'min(92vw, 430px)', textAlign: 'right' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14 }}>
          <Avatar src={member.user?.avatar} name={member.user?.name} size={52} />
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 700 }}>{member.user?.name}</div>
            <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{member.user?.publicId ? `ID: ${member.user.publicId}` : (member.user?.email || '')}</div>
            <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 4 }}>
              {member.role === 'admin' ? 'مسؤول' : 'عضو'}
              {member.tag ? ` • ${member.tag}` : ''}
              {member.isMuted ? ' • مكتوم' : ''}
              {!member.canSendMedia ? ' • الوسائط مقيدة' : ''}
              {!member.canSendVoice ? ' • الصوتيات مقيدة' : ''}
              {member.isBanned ? ' • محظور' : ''}
            </div>
          </div>
        </div>

        {!canManage ? (
          <div style={{ padding: 12, background: 'var(--bg-tertiary)', borderRadius: 10, color: 'var(--text-secondary)', fontSize: 13 }}>
            يمكنك عرض حالة العضو فقط. أدوات الإدارة متاحة للمسؤولين.
          </div>
        ) : (
          <div style={{ display: 'grid', gap: 8 }}>
            <button className="secondary-btn" disabled={busy} onClick={() => act(() => api.put(`/room-admin/${conversationId}/members/${member.userId}/mute`, { muted: !member.isMuted }))}><VolumeX size={16} /> {member.isMuted ? 'إلغاء الكتم' : 'كتم العضو'}</button>
            <button className="secondary-btn" disabled={busy} onClick={() => act(() => api.put(`/room-admin/${conversationId}/members/${member.userId}/media`, { allowed: !member.canSendMedia }))}><ImageOff size={16} /> {member.canSendMedia ? 'منع الوسائط' : 'السماح بالوسائط'}</button>
            <button className="secondary-btn" disabled={busy} onClick={() => act(() => api.put(`/room-admin/${conversationId}/members/${member.userId}/voice`, { allowed: !member.canSendVoice }))}><MicOff size={16} /> {member.canSendVoice ? 'منع الصوتيات' : 'السماح بالصوتيات'}</button>
            <button className="secondary-btn" disabled={busy} onClick={setTag}><Tags size={16} /> {member.tag ? 'تعديل الوصف الداخلي' : 'إضافة وصف داخلي'}</button>
            <button className={`secondary-btn ${member.isBanned ? '' : 'danger'}`} disabled={busy} onClick={toggleBan}><Ban size={16} /> {member.isBanned ? 'إلغاء الحظر' : 'حظر العضو من المحادثة'}</button>
          </div>
        )}

        <div className="modal-actions" style={{ marginTop: 14 }}>
          <button onClick={onClose}>{t('close')}</button>
        </div>
      </div>
    </div>
  );
}


function DropzoneOverlay({ active }) {
  if (!active) return null;
  return (
    <div className="dropzone-overlay">
      <div className="dropzone-card">
        <Inbox size={28} />
        <div className="dropzone-title">أفلت الملفات هنا</div>
        <div className="dropzone-text">ستظهر لك معاينة متعددة قبل الإرسال مباشرة</div>
      </div>
    </div>
  );
}

function AttachmentPreviewModal({ items, currentIndex, caption, onCaptionChange, onClose, onSend, sending, onSelect }) {
  if (!items?.length) return null;
  const item = items[currentIndex] || items[0];
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal attachment-preview-modal" onClick={e => e.stopPropagation()}>
        <div className="attachment-preview-head">
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <AttachmentTypeIcon type={item.kind} size={18} />
            <div>
              <div style={{ fontWeight: 700 }}>{item.file?.name || 'مرفق جديد'}</div>
              <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{items.length > 1 ? `عنصر ${currentIndex + 1} من ${items.length}` : (item.file?.type || 'ملف')}</div>
            </div>
          </div>
          <button className="secondary-btn" onClick={onClose}><X size={15} /> إغلاق</button>
        </div>
        <div className="attachment-preview-body">
          {item.kind === 'image' && item.previewUrl && <img src={item.previewUrl} alt={item.file?.name || ''} className="attachment-preview-image" />}
          {item.kind === 'video' && item.previewUrl && <video src={item.previewUrl} controls className="attachment-preview-video" />}
          {item.kind === 'voice' && item.previewUrl && <audio src={item.previewUrl} controls style={{ width: '100%' }} />}
          {item.kind === 'file' && (
            <div className="attachment-preview-file-card">
              <AttachmentTypeIcon type={item.kind} size={28} />
              <div>
                <div style={{ fontWeight: 700 }}>{item.file?.name}</div>
                <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{item.file?.size ? `${(item.file.size / 1024).toFixed(1)} KB` : 'ملف'}</div>
              </div>
            </div>
          )}
        </div>
        {items.length > 1 && (
          <div className="attachment-preview-strip">
            {items.map((entry, idx) => (
              <button key={`${entry.file?.name || 'file'}_${idx}`} type="button" className={`attachment-preview-thumb ${idx === currentIndex ? 'active' : ''}`} onClick={() => onSelect(idx)}>
                {entry.kind === 'image' && entry.previewUrl ? <img src={entry.previewUrl} alt={entry.file?.name || ''} /> : <span><AttachmentTypeIcon type={entry.kind} size={16} /></span>}
              </button>
            ))}
          </div>
        )}
        <textarea
          className="profile-input"
          style={{ minHeight: 84, marginBottom: 0 }}
          value={caption}
          onChange={e => onCaptionChange(e.target.value)}
          placeholder={items.length > 1 ? 'أضف وصفًا اختياريًا وسيُرفق مع أول عنصر فقط...' : 'أضف وصفًا اختياريًا مع المرفق...'}
        />
        <div className="modal-actions" style={{ marginTop: 14 }}>
          <button onClick={onClose}>إلغاء</button>
          <button onClick={onSend} style={{ background: 'var(--accent)', color: 'white' }} disabled={sending}>{sending ? 'جاري الإرسال...' : (items.length > 1 ? 'إرسال الكل' : 'إرسال المرفق')}</button>
        </div>
      </div>
    </div>
  );
}

export default function ChatWindow({ onCallStart, onOpenGroupSettings }) {
  const { user } = useAuth();
  const { t } = useLanguage();
  const { activeChat, messages, typingUsers, closeChat, loadOlderMessages, hasMoreMessages, loadingOlder, setMessages } = useChat();
  const socketRef = useSocket();
  const chat = activeChat;
  const recorder = useRecorder(socketRef, chat?.id);

  const draftKey = useMemo(() => chat ? `draft_${chat.id}` : null, [chat]);
  const [msg, setMsg] = useState('');
  const [showEmoji, setShowEmoji] = useState(false);
  const [replyTo, setReplyTo] = useState(null);
  const [lightbox, setLightbox] = useState(null);
  const [conversationInfo, setConversationInfo] = useState(null);
  const [reactionPicker, setReactionPicker] = useState(null);
  const [forwardMsg, setForwardMsg] = useState(null);
  const [showSearch, setShowSearch] = useState(false);
  const [showPinned, setShowPinned] = useState(false);
  const [showSchedule, setShowSchedule] = useState(false);
  const [showScheduledList, setShowScheduledList] = useState(false);
  const [editingMessageId, setEditingMessageId] = useState(null);
  const [editingText, setEditingText] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(null);
  const [highlightMessageId, setHighlightMessageId] = useState(null);
  const [pendingAttachments, setPendingAttachments] = useState([]);
  const [pendingAttachmentIndex, setPendingAttachmentIndex] = useState(0);
  const [attachmentCaption, setAttachmentCaption] = useState('');
  const [sendingAttachment, setSendingAttachment] = useState(false);
  const [quickMember, setQuickMember] = useState(null);
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState([]);
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false);
  const [dragActive, setDragActive] = useState(false);
  const [contentFilter, setContentFilter] = useState('all');
  const [showAnnouncement, setShowAnnouncement] = useState(false);
  const [announcementText, setAnnouncementText] = useState('');
  const [pinAnnouncement, setPinAnnouncement] = useState(true);
  const [showTranslatePanel, setShowTranslatePanel] = useState(false);
  const [translatePrefs, setTranslatePrefs] = useState({ sourceLang: 'auto', targetLang: 'en', autoTranslateBeforeSend: false, keepOriginal: true });
  const [translatingDraft, setTranslatingDraft] = useState(false);
  const [messageTranslations, setMessageTranslations] = useState({});
  const [mediaTranscripts, setMediaTranscripts] = useState({});
  const dragCounterRef = useRef(0);
  const messagesEndRef = useRef(null);
  const messagesAreaRef = useRef(null);
  const typingTimeoutRef = useRef(null);
  const fileInputRef = useRef(null);
  const textareaRef = useRef(null);
  const messageRefs = useRef({});

  const isNearBottom = useCallback(() => {
    const el = messagesAreaRef.current;
    if (!el) return true;
    const remaining = el.scrollHeight - el.scrollTop - el.clientHeight;
    return remaining < 180;
  }, []);

  const scrollToBottom = useCallback((behavior = 'smooth') => {
    requestAnimationFrame(() => messagesEndRef.current?.scrollIntoView({ behavior, block: 'end' }));
  }, []);

  useEffect(() => { scrollToBottom('auto'); }, [chat?.id, scrollToBottom]);
  useEffect(() => { setSelectionMode(false); setSelectedIds([]); setContentFilter('all'); }, [chat?.id]);
  useEffect(() => {
    if (!chat?.id) return;
    try {
      const raw = localStorage.getItem(`translatePrefs_${chat.id}`);
      if (raw) setTranslatePrefs(prev => ({ ...prev, ...JSON.parse(raw) }));
    } catch {}
  }, [chat?.id]);
  useEffect(() => {
    if (!chat?.id) return;
    try { localStorage.setItem(`translatePrefs_${chat.id}`, JSON.stringify(translatePrefs)); } catch {}
  }, [chat?.id, translatePrefs]);
  useEffect(() => {
    if (!draftKey) { setMsg(''); return; }
    setMsg(localStorage.getItem(draftKey) || '');
    setReplyTo(null);
    setShowEmoji(false);
  }, [draftKey]);

  useEffect(() => {
    if (!draftKey) return;
    if (msg.trim()) localStorage.setItem(draftKey, msg);
    else localStorage.removeItem(draftKey);
  }, [draftKey, msg]);
  useEffect(() => {
    if (!messages?.length) return;
    const last = messages[messages.length - 1];
    const mine = last?.senderId === user?.id;
    if (mine || isNearBottom()) scrollToBottom(mine ? 'smooth' : 'auto');
  }, [messages, user?.id, isNearBottom, scrollToBottom]);


  useEffect(() => () => { pendingAttachments.forEach(item => { if (item?.previewUrl) URL.revokeObjectURL(item.previewUrl); }); }, [pendingAttachments]);

  useEffect(() => {
    if (!textareaRef.current) return;
    textareaRef.current.style.height = '0px';
    textareaRef.current.style.height = Math.min(textareaRef.current.scrollHeight, 140) + 'px';
  }, [msg, editingText, editingMessageId]);
  useEffect(() => { if (!highlightMessageId) return; const t = setTimeout(() => setHighlightMessageId(null), 2200); return () => clearTimeout(t); }, [highlightMessageId]);
  useEffect(() => {
    let mounted = true;
    if (!chat?.id) return;
    (async () => {
      try {
        const r = await api.get(`/rooms/${chat.id}/info`);
        if (mounted) setConversationInfo(r.data);
      } catch {
        if (mounted) setConversationInfo(null);
      }
    })();
    return () => { mounted = false; };
  }, [chat?.id]);


  const refreshConversationInfo = useCallback(async () => {
    if (!chat?.id) return;
    try {
      const r = await api.get(`/rooms/${chat.id}/info`);
      setConversationInfo(r.data);
      setQuickMember(prev => prev ? (r.data.members?.find(m => m.userId === prev.userId) || prev) : prev);
    } catch {
      setConversationInfo(null);
    }
  }, [chat?.id]);

  const jumpToMessage = useCallback((messageId) => {
    requestAnimationFrame(() => {
      messageRefs.current[messageId]?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      setHighlightMessageId(messageId);
    });
  }, []);

  const selectedMessages = useMemo(() => messages.filter(m => selectedIds.includes(m.id)), [messages, selectedIds]);
  const toggleSelected = useCallback((messageId) => {
    setSelectedIds(prev => prev.includes(messageId) ? prev.filter(id => id !== messageId) : [...prev, messageId]);
  }, []);

  const exitSelectionMode = useCallback(() => {
    setSelectionMode(false);
    setSelectedIds([]);
  }, []);

  const copySelected = useCallback(async () => {
    if (!selectedMessages.length) return;
    const payload = selectedMessages
      .map(m => {
        const content = m.text || m.fileName || (m.type === 'voice' ? 'رسالة صوتية' : 'مرفق');
        return `${m.sender?.name || 'مستخدم'}: ${content}`;
      })
      .join('\n');
    try {
      if (navigator.clipboard?.writeText) await navigator.clipboard.writeText(payload);
      else window.prompt('انسخ المحتوى التالي', payload);
    } catch {
      window.prompt('انسخ المحتوى التالي', payload);
    }
  }, [selectedMessages]);

  const bulkDeleteSelected = useCallback(() => {
    if (!selectedIds.length || !socketRef.current || !chat) return;
    socketRef.current.emit('delete_messages', { messageIds: selectedIds, conversationId: chat.id });
    setMessages(prev => prev.map(m => selectedIds.includes(m.id) ? { ...m, isDeleted: true, text: null, fileUrl: null, fileName: null, fileSize: null } : m));
    setBulkDeleteOpen(false);
    exitSelectionMode();
  }, [selectedIds, socketRef, chat, setMessages, exitSelectionMode]);

  const handleKeyDown = (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); editingMessageId ? saveEdit() : sendMessage(); } };

  const handleTyping = (v) => {
    setMsg(v);
    const s = socketRef.current;
    if (!s || !chat) return;
    s.emit('typing', { conversationId: chat.id, isTyping: true });
    clearTimeout(typingTimeoutRef.current);
    typingTimeoutRef.current = setTimeout(() => s.emit('typing', { conversationId: chat.id, isTyping: false }), 2000);
  };

  const translateTextValue = useCallback(async (textValue) => {
    const payload = { text: textValue, sourceLang: translatePrefs.sourceLang || 'auto', targetLang: translatePrefs.targetLang || 'en' };
    const res = await api.post('/ai/translate', payload);
    return res.data;
  }, [translatePrefs]);

  const translateDraftNow = useCallback(async () => {
    if (!msg.trim()) return;
    try {
      setTranslatingDraft(true);
      const result = await translateTextValue(msg.trim());
      setMsg(result.translatedText || msg);
    } catch (err) {
      console.error('draft translate error', err);
      window.alert(t('connectionError')); // translation failed or AI not configured
    } finally {
      setTranslatingDraft(false);
    }
  }, [msg, translateTextValue]);

  const translateMessage = useCallback(async (message) => {
    if (!message?.id || !message?.text) return;
    setMessageTranslations(prev => ({ ...prev, [message.id]: { ...(prev[message.id] || {}), loading: true, error: '' } }));
    try {
      const result = await translateTextValue(message.text);
      setMessageTranslations(prev => ({ ...prev, [message.id]: { loading: false, text: result.translatedText || '', detected: result.detectedSourceLanguage || '' } }));
    } catch (err) {
      setMessageTranslations(prev => ({ ...prev, [message.id]: { loading: false, error: 'فشل الترجمة. تأكد من إعداد مفتاح الخدمة.' } }));
    }
  }, [translateTextValue]);

  const transcribeMessageMedia = useCallback(async (message) => {
    if (!message?.id || !message?.fileUrl) return;
    setMediaTranscripts(prev => ({ ...prev, [message.id]: { ...(prev[message.id] || {}), loading: true, error: '' } }));
    try {
      const res = await api.post('/ai/transcribe-from-url', { fileUrl: message.fileUrl, fileName: message.fileName || undefined });
      setMediaTranscripts(prev => ({ ...prev, [message.id]: { loading: false, text: res.data?.text || '', language: res.data?.language || '' } }));
    } catch (err) {
      setMediaTranscripts(prev => ({ ...prev, [message.id]: { loading: false, error: 'فشل التفريغ. تأكد من إعداد OPENAI_API_KEY.' } }));
    }
  }, []);


  async function sendMessage() {
    if (!msg.trim() || !socketRef.current || !chat) return;
    let outgoingText = msg.trim();
    if (translatePrefs.autoTranslateBeforeSend) {
      try {
        const result = await translateTextValue(outgoingText);
        if (result?.translatedText) outgoingText = translatePrefs.keepOriginal ? `${msg.trim()}

— ${translatePrefs.targetLang.toUpperCase()} —
${result.translatedText}` : result.translatedText;
      } catch (err) {
        console.error('send translate error', err);
      }
    }
    socketRef.current.emit('send_message', { conversationId: chat.id, text: outgoingText, tempId: Date.now(), replyToId: replyTo?.id || null });
    setMsg('');
    setReplyTo(null);
    setShowEmoji(false);
    if (draftKey) localStorage.removeItem(draftKey);
    socketRef.current.emit('typing', { conversationId: chat.id, isTyping: false });
  }


  const openAttachmentPreview = useCallback((files) => {
    const normalized = Array.from(files || []).filter(Boolean);
    if (!normalized.length || !chat) return;
    const items = normalized.map(file => ({ file, kind: inferAttachmentKind(file), previewUrl: URL.createObjectURL(file) }));
    setPendingAttachments(prev => {
      prev.forEach(item => { if (item?.previewUrl) URL.revokeObjectURL(item.previewUrl); });
      return items;
    });
    setPendingAttachmentIndex(0);
    setAttachmentCaption('');
  }, [chat]);

  const handleFileUpload = async (e) => {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;
    openAttachmentPreview(files);
    e.target.value = '';
  };

  const handleDrop = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounterRef.current = 0;
    setDragActive(false);
    const files = Array.from(e.dataTransfer?.files || []);
    if (files.length) openAttachmentPreview(files);
  }, [openAttachmentPreview]);

  const handleDragEnter = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounterRef.current += 1;
    if (chat) setDragActive(true);
  }, [chat]);

  const handleDragLeave = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounterRef.current = Math.max(0, dragCounterRef.current - 1);
    if (dragCounterRef.current === 0) setDragActive(false);
  }, []);

  const handleDragOver = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

  const sendPendingAttachment = async () => {
    if (!pendingAttachments.length || !socketRef.current || !chat || sendingAttachment) return;
    setSendingAttachment(true);
    try {
      for (let index = 0; index < pendingAttachments.length; index += 1) {
        const item = pendingAttachments[index];
        const fd = new FormData();
        fd.append('file', item.file);
        const res = await api.post('/upload', fd, { headers: { 'Content-Type': 'multipart/form-data' } });
        socketRef.current.emit('send_message', {
          conversationId: chat.id,
          text: index === 0 ? (attachmentCaption.trim() || null) : null,
          type: res.data.type,
          fileUrl: res.data.fileUrl,
          fileName: res.data.fileName,
          fileSize: res.data.fileSize,
          tempId: Date.now() + index,
          replyToId: index === 0 ? (replyTo?.id || null) : null
        });
      }
      pendingAttachments.forEach(item => { if (item.previewUrl) URL.revokeObjectURL(item.previewUrl); });
      setPendingAttachments([]);
      setPendingAttachmentIndex(0);
      setAttachmentCaption('');
      setReplyTo(null);
      setShowEmoji(false);
    } catch (err) {
      console.error('Upload error:', err);
    } finally {
      setSendingAttachment(false);
    }
  };

  const doDelete = async (id) => {
    const target = messages.find(m => m.id === id);
    const mine = target?.senderId === user.id;
    const amAdmin = conversationInfo?.myRole === 'admin';
    if (!mine && amAdmin) {
      try {
        await api.delete(`/messages/${id}`);
        setMessages(prev => prev.map(m => m.id === id ? { ...m, isDeleted: true, text: 'تم حذف هذه الرسالة بواسطة الإدارة', fileUrl: null, fileName: null, fileSize: null } : m));
        setConfirmDelete(null);
        refreshConversationInfo();
      } catch {}
      return;
    }
    socketRef.current?.emit('delete_message', { messageId: id, conversationId: chat.id });
    setConfirmDelete(null);
  };
  const handleReaction = (mid, emoji) => { socketRef.current?.emit('toggle_reaction', { messageId: mid, conversationId: chat.id, emoji }); setReactionPicker(null); };
  const handlePin = (mid) => { socketRef.current?.emit('toggle_pin', { messageId: mid, conversationId: chat.id }); };

  const startEdit = (message) => {
    setEditingMessageId(message.id);
    setEditingText(message.text || '');
    setReplyTo(null);
    setShowEmoji(false);
    scrollToBottom('smooth');
    requestAnimationFrame(() => textareaRef.current?.focus());
  };

  const saveEdit = () => {
    if (!editingMessageId || !chat || !socketRef.current || !editingText.trim()) return;
    socketRef.current.emit('edit_message', { messageId: editingMessageId, conversationId: chat.id, newText: editingText.trim() });
    setMessages(prev => prev.map(m => m.id === editingMessageId ? { ...m, text: editingText.trim(), isEdited: true, editedAt: new Date().toISOString() } : m));
    setEditingMessageId(null);
    setEditingText('');
    scrollToBottom('smooth');
  };

  const cancelEdit = () => {
    setEditingMessageId(null);
    setEditingText('');
    scrollToBottom('smooth');
  };

  const fmtTime = (d) => new Date(d).toLocaleTimeString('ar', { hour: '2-digit', minute: '2-digit' });
  const isAdmin = conversationInfo?.myRole === 'admin';
  const getMember = (userId) => conversationInfo?.members?.find(m => m.userId === userId);
  const isAdminAuthoredMessage = (message) => !!message && (message.type === 'admin_announcement' || getMember(message.senderId)?.role === 'admin');
  const sendAnnouncement = () => {
    if (!announcementText.trim() || !chat || !socketRef.current) return;
    socketRef.current.emit('admin_announcement', { conversationId: chat.id, text: announcementText.trim(), pin: pinAnnouncement });
    setAnnouncementText('');
    setPinAnnouncement(true);
    setShowAnnouncement(false);
  };
  const fmtDate = (d) => { const dt = new Date(d), diff = Math.floor((Date.now() - dt) / 86400000); return diff === 0 ? 'اليوم' : diff === 1 ? 'أمس' : dt.toLocaleDateString('ar', { day: 'numeric', month: 'long' }); };
  const fmtSize = (b) => { if (!b) return ''; if (b < 1024) return b + ' B'; if (b < 1048576) return (b / 1024).toFixed(1) + ' KB'; return (b / 1048576).toFixed(1) + ' MB'; };
  const showDateDiv = (m, p) => !p || new Date(m.createdAt).toDateString() !== new Date(p.createdAt).toDateString();
  const isTyping = typingUsers && Object.values(typingUsers).some(t => t.conversationId === chat?.id && t.isTyping);

  const groupReactions = (reactions) => {
    if (!reactions?.length) return [];
    const map = {};
    reactions.forEach(r => {
      if (!map[r.emoji]) map[r.emoji] = { emoji: r.emoji, count: 0, users: [], mine: false };
      map[r.emoji].count++; map[r.emoji].users.push(r.user?.name);
      if (r.userId === user.id) map[r.emoji].mine = true;
    });
    return Object.values(map);
  };

  const mediaMessages = useMemo(() => messages.filter(entry => ['image', 'video'].includes(entry.type) && entry.fileUrl && !entry.isDeleted).map(entry => ({ ...entry, mediaType: entry.type })), [messages]);

  const contentCounts = useMemo(() => ({
    all: messages.filter(m => !m.isDeleted).length,
    media: messages.filter(m => ['image', 'video'].includes(m.type) && !m.isDeleted).length,
    files: messages.filter(m => ['file','voice'].includes(m.type) && !m.isDeleted).length,
    links: messages.filter(m => !m.isDeleted && !!extractUrls(m.text || '').length).length,
    pinned: messages.filter(m => m.isPinned && !m.isDeleted).length,
    notices: messages.filter(m => m.isSystem && !m.isDeleted).length,
    admin: messages.filter(m => isAdminAuthoredMessage(m) && !m.isDeleted && !m.isSystem).length,
  }), [messages, conversationInfo]);

  const latestPinned = useMemo(() => messages.find(m => m.isPinned && !m.isDeleted), [messages]);

  const filteredMessages = useMemo(() => {
    if (contentFilter === 'all') return messages;
    return messages.filter(m => {
      if (contentFilter === 'media') return ['image', 'video'].includes(m.type) && !m.isDeleted;
      if (contentFilter === 'files') return ['file', 'voice'].includes(m.type) && !m.isDeleted;
      if (contentFilter === 'links') return !m.isDeleted && !!extractUrls(m.text || '').length;
      if (contentFilter === 'pinned') return m.isPinned && !m.isDeleted;
      if (contentFilter === 'notices') return m.isSystem && !m.isDeleted;
      if (contentFilter === 'admin') return isAdminAuthoredMessage(m) && !m.isDeleted && !m.isSystem;
      return true;
    });
  }, [messages, contentFilter, conversationInfo]);

  const openMediaLightbox = useCallback((messageId) => {
    const index = mediaMessages.findIndex(entry => entry.id === messageId);
    if (index === -1) return;
    setLightbox({ index, items: mediaMessages.map(entry => ({ id: entry.id, url: buildAssetUrl(entry.fileUrl), name: entry.fileName, senderName: entry.sender?.name, createdAt: entry.createdAt, type: entry.mediaType })) });
  }, [mediaMessages]);

  const renderMsg = (m, index) => {
    if (m.isDeleted) return <span className="msg-deleted">تم حذف هذه الرسالة</span>;
    if (m.isSystem) return <SystemMessageCard message={m} />;
    const adminAuthored = isAdminAuthoredMessage(m);
    const previewLinks = Array.from(new Set([...(m.text ? extractUrls(m.text) : []), ...(m.linkPreview ? [m.linkPreview] : [])])).slice(0, 2);
    return (<>{adminAuthored && <div className={`admin-post-badge ${m.type === 'admin_announcement' ? 'primary' : ''}`}>{m.type === 'admin_announcement' ? <><Megaphone size={12} /> إعلان إداري</> : <><BadgeCheck size={12} /> منشور إدارة</>}</div>}{m.forwardedFrom && <div style={{ fontSize: 11, color: 'var(--text-secondary)', fontStyle: 'italic', marginBottom: 2 }}>↩ رسالة معاد توجيهها</div>}
      {m.replyTo && <div className="msg-reply-preview rich" onClick={() => jumpToMessage(m.replyTo.id)}><div className="reply-icon-wrap"><AttachmentTypeIcon type={m.replyTo.type || (m.replyTo.fileUrl ? 'file' : 'text')} size={14} /></div><div style={{ minWidth: 0 }}><div className="reply-name">{m.replyTo.sender?.name || 'رسالة مقتبسة'}</div><div className="reply-text">{attachmentSummary(m.replyTo)}</div></div></div>}
      {m.type === 'image' && m.fileUrl && <div className={`attachment-card media-card ${['image','video'].includes(messages[index - 1]?.type) && messages[index - 1]?.senderId === m.senderId ? 'attachment-card-stacked' : ''} ${['image','video'].includes(messages[index + 1]?.type) && messages[index + 1]?.senderId === m.senderId ? 'attachment-card-stacked-next' : ''}`}><img loading="lazy" src={buildAssetUrl(m.fileUrl)} alt={m.fileName || ''} className="msg-image" onClick={() => openMediaLightbox(m.id)} /><div className="attachment-actions"><button type="button" className="attachment-link attachment-link-button" onClick={() => openMediaLightbox(m.id)}><Clapperboard size={14} /> عرض موسع</button><a href={buildAssetUrl(m.fileUrl)} target="_blank" rel="noreferrer" className="attachment-link"><Download size={14} /> فتح</a></div></div>}
      {m.type === 'video' && m.fileUrl && <div className={`attachment-card media-card ${['image','video'].includes(messages[index - 1]?.type) && messages[index - 1]?.senderId === m.senderId ? 'attachment-card-stacked' : ''} ${['image','video'].includes(messages[index + 1]?.type) && messages[index + 1]?.senderId === m.senderId ? 'attachment-card-stacked-next' : ''}`}><video src={buildAssetUrl(m.fileUrl)} controls className="msg-video" onDoubleClick={() => openMediaLightbox(m.id)} /><div className="attachment-actions"><button type="button" className="attachment-link attachment-link-button" onClick={() => openMediaLightbox(m.id)}><Clapperboard size={14} /> عرض موسع</button><a href={buildAssetUrl(m.fileUrl)} target="_blank" rel="noreferrer" className="attachment-link"><Download size={14} /> تنزيل الفيديو</a></div></div>}
      {m.type === 'video' && m.fileUrl && <TranscriptBlock state={mediaTranscripts[m.id] || {}} onTranscribe={() => transcribeMessageMedia(m)} />}
      {m.type === 'file' && m.fileUrl && <a href={buildAssetUrl(m.fileUrl)} target="_blank" rel="noreferrer" className="msg-file"><div className="msg-file-icon"><FileText size={20} color="white" /></div><div className="msg-file-info"><div className="msg-file-name">{m.fileName}</div><div className="msg-file-size">{fmtSize(m.fileSize)}</div></div><Download size={16} color="var(--text-secondary)" /></a>}
      {m.type === 'voice' && m.fileUrl && <><VoicePlayer url={buildAssetUrl(m.fileUrl)} /><TranscriptBlock state={mediaTranscripts[m.id] || {}} onTranscribe={() => transcribeMessageMedia(m)} /></>}
      {m.text && <div className="msg-text-content">{m.text}</div>}
      {m.text && !m.isDeleted && <div className="msg-inline-tools"><button type="button" className="attachment-link attachment-link-button" onClick={() => translateMessage(m)}>{messageTranslations[m.id]?.loading ? <Loader2 size={14} className="spin" /> : <Languages size={14} />} ترجمة</button></div>}
      {!!messageTranslations[m.id]?.text && <div className="msg-translation"><div className="msg-translation-label">ترجمة إلى {translatePrefs.targetLang.toUpperCase()}</div><div>{messageTranslations[m.id].text}</div></div>}
      {!!messageTranslations[m.id]?.error && <div className="transcript-error">{messageTranslations[m.id].error}</div>}
      {!!previewLinks.length && <div className="link-preview-list">{previewLinks.map(link => <LinkPreviewCard key={link} url={link} />)}</div>}
    </>);
  };

  if (!chat) return null;
  const pinnedCount = messages.filter(m => m.isPinned && !m.isDeleted).length;
  const contentFilterOptions = [
    { key: 'all', label: 'الكل' },
    { key: 'media', label: 'وسائط' },
    { key: 'files', label: 'ملفات' },
    { key: 'links', label: 'روابط' },
    { key: 'pinned', label: 'مثبتة' },
    { key: 'notices', label: 'نظام' },
    { key: 'admin', label: 'إدارة' },
  ];
  const allSelectedAreMineOrAdmin = selectedMessages.every(m => m.senderId === user.id || (chat.isGroup && isAdmin && !m.isSystem));

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', position: 'relative' }} onDragEnter={handleDragEnter} onDragLeave={handleDragLeave} onDragOver={handleDragOver} onDrop={handleDrop}>
      <DropzoneOverlay active={dragActive} />
      {showSearch && <MessageSearch conversationId={chat.id} onClose={() => setShowSearch(false)} onSelect={(msg) => jumpToMessage(msg.id)} />}

      {showAnnouncement && <div className="modal-overlay" onClick={() => setShowAnnouncement(false)}><div className="modal" onClick={e => e.stopPropagation()} style={{ width: 'min(92vw, 500px)', textAlign: 'right' }}><h3 style={{ marginBottom: 10 }}>إعلان إداري سريع</h3><div style={{ color: 'var(--text-secondary)', fontSize: 13, marginBottom: 10 }}>أرسل منشورًا واضحًا من الإدارة داخل هذه {chat.isChannel ? 'القناة' : 'المجموعة'} مع تمييز بصري أعلى من الرسائل العادية.</div><textarea className="chat-input" style={{ minHeight: 120 }} value={announcementText} onChange={e => setAnnouncementText(e.target.value)} placeholder="اكتب الإعلان الإداري هنا..." /><label style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 12, fontSize: 13, color: 'var(--text-secondary)' }}><input type="checkbox" checked={pinAnnouncement} onChange={e => setPinAnnouncement(e.target.checked)} /> تثبيت الإعلان مباشرة بعد نشره</label><div className="modal-actions"><button onClick={() => setShowAnnouncement(false)}>إلغاء</button><button onClick={sendAnnouncement} style={{ background: 'var(--accent)', color: '#fff' }}>نشر الإعلان</button></div></div></div>}

      {showPinned && <PinnedMessagesPanel conversationId={chat.id} onClose={() => setShowPinned(false)} onSelectMessage={jumpToMessage} />}
      {showSchedule && <ScheduleMessage conversationId={chat.id} text={msg} onClose={() => setShowSchedule(false)} />}
      {showScheduledList && <ScheduledMessagesManager onClose={() => setShowScheduledList(false)} onSelectConversation={() => {}} />}

      <div className="chat-header">
        {selectionMode ? (
          <>
            <div className="chat-header-info">
              <ArrowRight size={20} style={{ cursor: 'pointer' }} className="back-btn" onClick={exitSelectionMode} />
              <div><div className="name">تحديد الرسائل</div><div className="status">{selectedIds.length} محددة</div></div>
            </div>
            <div className="chat-header-actions">
              <Copy size={20} onClick={copySelected} />
              <Forward size={20} onClick={() => selectedIds.length && setForwardMsg(selectedMessages)} />
              {allSelectedAreMineOrAdmin && <Trash2 size={20} onClick={() => setBulkDeleteOpen(true)} />}
            </div>
          </>
        ) : (
        <>
        <div className="chat-header-info" onClick={() => chat.isGroup && onOpenGroupSettings?.()}>
          <ArrowRight size={20} style={{ cursor: 'pointer' }} className="back-btn" onClick={e => { e.stopPropagation(); closeChat(); }} />
          <Avatar src={chat.avatar} name={chat.name} size={40} />
          <div><div className="name">{chat.name}</div><div className="status">{isTyping ? 'يكتب...' : (chat.status === 'online' ? 'متصل' : (chat.isGroup ? 'اضغط للتفاصيل' : 'غير متصل'))}</div></div>
          {chat.isGroup && isAdmin && <div style={{ marginInlineStart: 8, padding: '4px 8px', borderRadius: 999, background: 'rgba(37,211,102,.12)', color: 'var(--accent)', fontSize: 11, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 5 }}><Shield size={12} /> إدارة سريعة</div>}
        </div>
        <div className="chat-header-actions">
          <CheckSquare size={20} onClick={() => setSelectionMode(true)} />
          <Clock3 size={20} onClick={() => setShowScheduledList(true)} />
          <SearchIcon size={20} onClick={() => setShowSearch(true)} />
          {isAdmin && (chat.isGroup || chat.isChannel) && <Megaphone size={20} onClick={() => setShowAnnouncement(true)} />}
          <Phone size={20} title={chat?.isGroup || chat?.isChannel ? 'بدء مكالمة جماعية' : 'اتصال صوتي'} onClick={() => onCallStart?.('audio')} />
          <Video size={20} title={chat?.isGroup || chat?.isChannel ? 'بدء مكالمة فيديو جماعية' : 'اتصال فيديو'} onClick={() => onCallStart?.('video')} />
        </div>
        </>
        )}
      </div>

      {pinnedCount > 0 && (
        <div className="pinned-bar" onClick={() => setShowPinned(true)}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}><Pin size={14} color="var(--accent)" /><span>{pinnedCount} رسالة مثبتة</span></div>
          <ChevronDown size={16} color="var(--text-secondary)" />
        </div>
      )}

      {(chat.isGroup || chat.isChannel) && latestPinned && (
        <div className="featured-post-card" onClick={() => jumpToMessage(latestPinned.id)}>
          <div className="featured-post-head">
            <span className="featured-post-badge">{chat.isChannel ? 'منشور مثبت' : 'رسالة مثبتة بارزة'}</span>
            <span className="featured-post-meta">{latestPinned.sender?.name || chat.name}</span>
          </div>
          <div className="featured-post-body">{latestPinned.text || latestPinned.fileName || 'محتوى مثبت'}</div>
        </div>
      )}

      {(chat.isGroup || chat.isChannel) && (
        <div className="chat-content-filters">
          {contentFilterOptions.map(opt => (
            <button key={opt.key} className={`chat-content-chip ${contentFilter === opt.key ? 'active' : ''}`} onClick={() => setContentFilter(opt.key)}>
              <span>{opt.label}</span>
              <span className="chat-content-count">{contentCounts[opt.key] || 0}</span>
            </button>
          ))}
        </div>
      )}

      {conversationInfo && (conversationInfo.onlyAdmins || conversationInfo.noMedia || conversationInfo.noVoice || conversationInfo.requireApproval || conversationInfo.welcomeMsg) && (
        <div className="chat-room-banner">
          {conversationInfo.welcomeMsg && <div className="chat-room-banner-line">{conversationInfo.welcomeMsg}</div>}
          <div className="chat-room-banner-tags">
            {conversationInfo.onlyAdmins && <span>المسؤولون فقط يرسلون</span>}
            {conversationInfo.noMedia && <span>الوسائط مقيدة</span>}
            {conversationInfo.noVoice && <span>الصوتيات مقيدة</span>}
            {conversationInfo.requireApproval && <span>الانضمام بموافقة</span>}
          </div>
        </div>
      )}

      <div className="messages-area" onClick={() => setReactionPicker(null)}>
        <div className="load-older-wrap">
          {hasMoreMessages ? <button className="load-older-btn" onClick={loadOlderMessages} disabled={loadingOlder}>{loadingOlder ? 'جاري تحميل الرسائل الأقدم...' : 'تحميل رسائل أقدم'}</button> : messages.length > 0 ? <div className="load-older-done">بداية المحادثة</div> : null}
        </div>

        {filteredMessages.length === 0 && <div className="content-filter-empty">لا توجد رسائل تطابق هذا القسم الآن</div>}
        {filteredMessages.map((m, i) => {
          const isMine = m.senderId === user.id, sd = showDateDiv(m, filteredMessages[i - 1]), reactions = groupReactions(m.reactions);
          return (
            <React.Fragment key={m.id || i}>
              {sd && <div className="date-divider"><span>{fmtDate(m.createdAt)}</span></div>}
              <div className="msg-wrapper" ref={el => { if (el) messageRefs.current[m.id] = el; }} style={{ alignSelf: isMine ? 'flex-start' : 'flex-end', maxWidth: 'min(74%, 780px)', width: 'fit-content' }}>
                <div className={`msg ${isMine ? 'msg-mine' : 'msg-other'} ${m.isPinned ? 'msg-pinned' : ''} ${highlightMessageId === m.id ? 'msg-highlighted' : ''} ${selectedIds.includes(m.id) ? 'msg-selected' : ''} ${m.isSystem ? 'msg-system-shell' : ''} ${isAdminAuthoredMessage(m) && !m.isSystem ? 'msg-admin-post' : ''}`} onTouchStart={(e) => { const t = e.touches?.[0]; if (t) { e.currentTarget.dataset.touchX = String(t.clientX); e.currentTarget.dataset.touchY = String(t.clientY); } }} onTouchEnd={(e) => { const startX = Number(e.currentTarget.dataset.touchX || 0); const startY = Number(e.currentTarget.dataset.touchY || 0); const t = e.changedTouches?.[0]; if (!t || selectionMode) return; const dx = t.clientX - startX; const dy = Math.abs(t.clientY - startY); if (dx < -70 && dy < 40 && !m.isDeleted) { setReplyTo(m); } }} onClick={(e) => { if (selectionMode && !e.target.closest('.msg-actions')) toggleSelected(m.id); }}>
                  {!m.isDeleted && !m.isSystem && <div className="msg-actions">
                    <button className="msg-action-btn" onClick={(e) => { e.stopPropagation(); if (!selectionMode) setSelectionMode(true); toggleSelected(m.id); }} title="تحديد">{selectedIds.includes(m.id) ? <CheckSquare size={14} /> : <Square size={14} />}</button>
                    <button className="msg-action-btn" onClick={() => setReplyTo(m)} title="رد"><Reply size={14} /></button>
                    <button className="msg-action-btn" onClick={e => { e.stopPropagation(); setReactionPicker(reactionPicker === m.id ? null : m.id); }} title="تعبير"><SmilePlus size={14} /></button>
                    <button className="msg-action-btn" onClick={() => setForwardMsg(m)} title="توجيه"><Forward size={14} /></button>
                    <button className="msg-action-btn" onClick={() => handlePin(m.id)} title="تثبيت"><Pin size={14} /></button>
                    {isMine && !m.isDeleted && m.type === 'text' && <button className="msg-action-btn" onClick={() => startEdit(m)} title="تعديل"><Pencil size={14} /></button>}
                    {(isMine || (chat.isGroup && isAdmin && !m.isSystem)) && <button className="msg-action-btn" onClick={() => setConfirmDelete(m.id)} title={isMine ? 'حذف' : 'حذف إداري'}><Trash2 size={14} /></button>}
                  </div>}
                  {reactionPicker === m.id && <div className="reaction-picker" style={{ position: 'absolute', top: -40, zIndex: 10 }} onClick={e => e.stopPropagation()}>{QUICK_REACTIONS.map(e => <span key={e} onClick={() => handleReaction(m.id, e)}>{e}</span>)}</div>}
                  {chat.isGroup && !isMine && m.sender && <div className="msg-sender" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span>{m.sender.name}</span>
                    <button type="button" className="msg-action-btn" onClick={(e) => { e.stopPropagation(); setQuickMember(getMember(m.senderId) || { userId: m.senderId, user: m.sender }); }} title="فتح بطاقة العضو"><Shield size={12} /></button>
                  </div>}
                  {renderMsg(m, i)}
                  {!m.isSystem && <div className="msg-time">
                    {m.isPinned && <Pin size={10} />}
                    {m.isEdited && <span className="msg-edited">معدل</span>}
                    {fmtTime(m.createdAt)}
                    {isMine && !m.isDeleted && (m.isRead ? <CheckCheck size={14} color="#53bdeb" /> : <Check size={14} />)}
                  </div>}
                </div>
                {reactions.length > 0 && <div className="msg-reactions" style={{ alignSelf: isMine ? 'flex-start' : 'flex-end' }}>{reactions.map(r => <span key={r.emoji} className={`reaction-badge ${r.mine ? 'mine' : ''}`} onClick={() => handleReaction(m.id, r.emoji)} title={r.users.join(', ')}>{r.emoji}<span className="count">{r.count > 1 ? r.count : ''}</span></span>)}</div>}
              </div>
            </React.Fragment>
          );
        })}
        {isTyping && <div className="typing-indicator">{t('typing')}</div>}
        <div ref={messagesEndRef} />
      </div>

      {showEmoji && <EmojiPicker onSelect={(e) => { setMsg(v => v + e); }} onClose={() => setShowEmoji(false)} />}

      <div className="chat-composer">
      {editingMessageId && <div className="reply-bar"><div className="reply-bar-content"><div className="reply-bar-title">{t('edit')}</div><div className="reply-bar-text">{t('draftEditing')}</div></div><button className="reply-close" onClick={cancelEdit}><X size={16} /></button></div>}
      {replyTo && !editingMessageId && <div className="reply-bar rich"><div className="reply-bar-icon"><Reply size={15} /></div><div className="reply-bar-content"><div className="reply-bar-title">رد على {replyTo.sender?.name || 'رسالة'}</div><div className="reply-bar-text">{attachmentSummary(replyTo)}</div></div><button className="reply-close" onClick={() => setReplyTo(null)}><X size={16} /></button></div>}
      {!replyTo && !editingMessageId && !!msg.trim() && <div className="draft-badge">تم حفظ المسودة تلقائيًا</div>}

      <div className="chat-input-row">
        <button className="icon-btn" onClick={() => setShowEmoji(v => !v)}><Smile size={20} /></button>
        <button className="icon-btn" onClick={() => fileInputRef.current?.click()} title="إرفاق ملف أو عدة ملفات أو اسحبها إلى نافذة المحادثة"><Paperclip size={20} /></button>
        <input ref={fileInputRef} type="file" hidden multiple onChange={handleFileUpload} />
        <div className="chat-input-wrap">
          <textarea ref={textareaRef} value={editingMessageId ? editingText : msg} onChange={e => editingMessageId ? setEditingText(e.target.value) : handleTyping(e.target.value)} onKeyDown={handleKeyDown} placeholder={editingMessageId ? t('edit') : t('typeMessage')} rows={1} className="chat-input" />
        </div>
        {!editingMessageId && <button className="icon-btn" onClick={() => setShowTranslatePanel(true)} title={t('language')}><Languages size={18} /></button>}
        {!editingMessageId && !!msg.trim() && <button className="icon-btn" onClick={() => setShowSchedule(true)} title={t('schedule')}><Clock3 size={18} /></button>}
        {editingMessageId ? <button className="send-btn" onClick={saveEdit}><Check size={18} /></button> : (msg.trim() ? <button className="send-btn" onClick={sendMessage}><Send size={18} /></button> : <button className={`send-btn ${recorder.isRecording ? 'recording' : ''}`} onClick={recorder.isRecording ? recorder.stop : recorder.start}><Mic size={18} /></button>)}
      </div>
      </div>

      {showTranslatePanel && <TranslationPanel prefs={translatePrefs} setPrefs={setTranslatePrefs} onClose={() => setShowTranslatePanel(false)} onTranslateDraft={translateDraftNow} translatingDraft={translatingDraft} t={t} />}
      {!!pendingAttachments.length && <AttachmentPreviewModal items={pendingAttachments} currentIndex={pendingAttachmentIndex} caption={attachmentCaption} onCaptionChange={setAttachmentCaption} onSelect={setPendingAttachmentIndex} onClose={() => { pendingAttachments.forEach(item => { if (item?.previewUrl) URL.revokeObjectURL(item.previewUrl); }); setPendingAttachments([]); setPendingAttachmentIndex(0); setAttachmentCaption(''); }} onSend={sendPendingAttachment} sending={sendingAttachment} />}
      {lightbox && <div className="modal-overlay" onClick={() => setLightbox(null)}><div className="lightbox-card lightbox-card-wide" onClick={e => e.stopPropagation()}>{lightbox.items?.length > 1 && <button type="button" className="lightbox-nav lightbox-nav-prev" onClick={() => setLightbox(prev => ({ ...prev, index: (prev.index - 1 + prev.items.length) % prev.items.length }))}><ChevronRight size={18} /></button>}{lightbox.items?.length > 1 && <button type="button" className="lightbox-nav lightbox-nav-next" onClick={() => setLightbox(prev => ({ ...prev, index: (prev.index + 1) % prev.items.length }))}><ChevronLeft size={18} /></button>}{lightbox.items?.[lightbox.index]?.type === 'video' ? <video src={lightbox.items?.[lightbox.index]?.url} controls autoPlay className="lightbox-video" /> : <img src={lightbox.items?.[lightbox.index]?.url} alt={lightbox.items?.[lightbox.index]?.name || 'preview'} className="lightbox-image" />}<div className="lightbox-meta"><div><div className="lightbox-name">{lightbox.items?.[lightbox.index]?.name || (lightbox.items?.[lightbox.index]?.type === 'video' ? 'فيديو' : 'صورة')}</div><div className="lightbox-sub">{lightbox.items?.length > 1 ? `عنصر ${lightbox.index + 1} من ${lightbox.items.length}` : 'عنصر واحد'}{lightbox.items?.[lightbox.index]?.senderName ? ` • ${lightbox.items[lightbox.index].senderName}` : ''}</div></div><div className="lightbox-chips"><span>{lightbox.items?.[lightbox.index]?.type === 'video' ? 'فيديو' : 'صورة'}</span><span>معرض الوسائط</span></div></div><div className="lightbox-actions"><a href={lightbox.items?.[lightbox.index]?.url} target="_blank" rel="noreferrer" className="secondary-btn"><Download size={15} /> {lightbox.items?.[lightbox.index]?.type === 'video' ? 'فتح الفيديو' : 'فتح الصورة'}</a><button className="secondary-btn" onClick={() => setLightbox(null)}>إغلاق</button></div></div></div>}
      {forwardMsg && <ForwardModal message={Array.isArray(forwardMsg) ? null : forwardMsg} messages={Array.isArray(forwardMsg) ? forwardMsg : null} onClose={() => setForwardMsg(null)} />}
      {quickMember && <QuickMemberPanel member={quickMember} conversationId={chat.id} canManage={!!isAdmin && quickMember.userId !== user.id} onClose={() => setQuickMember(null)} onRefresh={refreshConversationInfo} />}
      {confirmDelete && <div className="modal-overlay"><div className="modal"><h3>{(() => { const target = messages.find(m => m.id === confirmDelete); return target?.senderId === user.id ? 'حذف الرسالة؟' : 'حذف الرسالة إداريًا؟'; })()}</h3><div style={{ color: 'var(--text-secondary)', fontSize: 13, marginTop: -6, marginBottom: 12 }}>{(() => { const target = messages.find(m => m.id === confirmDelete); return target?.senderId === user.id ? 'سيتم إخفاؤها من المحادثة.' : 'سيظهر للأعضاء أن الإدارة حذفت الرسالة.'; })()}</div><div className="modal-actions"><button onClick={() => setConfirmDelete(null)}>إلغاء</button><button onClick={() => doDelete(confirmDelete)} style={{ background: 'var(--danger)', color: 'white' }}>حذف</button></div></div></div>}
      {bulkDeleteOpen && <div className="modal-overlay"><div className="modal"><h3>حذف الرسائل المحددة؟</h3><div style={{ color: 'var(--text-secondary)', fontSize: 13, marginTop: -6, marginBottom: 12 }}>سيتم حذف {selectedIds.length} رسالة دفعة واحدة من هذه المحادثة.</div><div className="modal-actions"><button onClick={() => setBulkDeleteOpen(false)}>إلغاء</button><button onClick={bulkDeleteSelected} style={{ background: 'var(--danger)', color: 'white' }}>حذف الكل</button></div></div></div>}
    </div>
  );
}
