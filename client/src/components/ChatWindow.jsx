import { useEffect, useRef, useState } from 'react';
import { post } from '../api/client';
import { t } from '../i18n/strings';
import { formatDuration, formatTime, fullUrl, isImage, isVideo } from '../utils/format';
import Avatar from './Avatar';
import Composer from './Composer';
import VoiceNotePlayer from './VoiceNotePlayer';

const quickReactions = ['👍', '❤️', '😂', '😮', '🔥', '🙏'];

const presenceLabel = (locale, conversation, onlineUserIds, currentUserId) => {
  if (!conversation) return '';
  if (conversation.type !== 'direct') return `${conversation.members?.length || 0} ${t(locale, 'members')}`;
  const other = conversation.members?.find((member) => member.id !== currentUserId);
  if (!other) return '';
  if (onlineUserIds.includes(other.id)) return t(locale, 'online');
  return `${t(locale, 'lastSeen')} ${formatTime(other.lastSeen || conversation.presence)}`;
};

const MessageMedia = ({ message }) => {
  if (!message.mediaUrl) return null;
  const url = fullUrl(message.mediaUrl);
  if (message.type === 'audio') return <VoiceNotePlayer message={message} />;
  if (isImage(message.mediaName || message.mediaUrl, message.mediaMime)) return <img src={url} alt={message.mediaName || 'file'} className="message-media" />;
  if (isVideo(message.mediaName || message.mediaUrl, message.mediaMime)) return <video controls src={url} className="message-media" />;
  return <a href={url} target="_blank" rel="noreferrer">{message.mediaName || 'file'}</a>;
};

const actionLabel = (locale, message) => {
  if (message.type === 'image') return t(locale, 'replyToImage');
  if (message.type === 'audio') return t(locale, 'replyToVoice');
  return t(locale, 'reply');
};

export default function ChatWindow({
  locale,
  conversation,
  messages,
  currentUser,
  onSend,
  onStartCall,
  typingState,
  onTyping,
  onlineUserIds,
  onLoadOlder,
  hasMore,
  onEditMessage,
  onDeleteMessage,
  onToggleStar,
  onForwardMessage,
  onBack,
}) {
  const [replyTo, setReplyTo] = useState(null);
  const [editingId, setEditingId] = useState(null);
  const [editText, setEditText] = useState('');
  const [activeMessageId, setActiveMessageId] = useState(null);
  const listRef = useRef(null);
  const composerAnchorRef = useRef(null);
  const bottomAnchorRef = useRef(null);
  const shouldStickToBottomRef = useRef(true);
  const previousConversationIdRef = useRef(null);

  useEffect(() => {
    setReplyTo(null);
    setEditingId(null);
    setEditText('');
    setActiveMessageId(null);
  }, [conversation?.id]);

  useEffect(() => {
    const list = listRef.current;
    if (!list) return;
    const conversationChanged = previousConversationIdRef.current !== conversation?.id;
    const latestMessage = messages[messages.length - 1];
    const sentByMe = latestMessage?.senderId === currentUser?.id;
    if (conversationChanged || shouldStickToBottomRef.current || sentByMe) {
      requestAnimationFrame(() => {
        bottomAnchorRef.current?.scrollIntoView({ behavior: conversationChanged ? 'auto' : 'smooth', block: 'end' });
      });
    }
    previousConversationIdRef.current = conversation?.id;
  }, [messages, conversation?.id, currentUser?.id]);

  if (!conversation) {
    return (
      <section className="chat-window empty card chat-standalone-page">
        <div className="empty-panel">
          <div className="empty-illustration large">💬</div>
          <h2>{t(locale, 'welcomeTitle')}</h2>
          <p>{t(locale, 'welcomeText')}</p>
        </div>
      </section>
    );
  }

  const handleReply = (message) => {
    setReplyTo(message);
    setActiveMessageId(null);
    composerAnchorRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  };

  const handleReaction = async (messageId, emoji) => {
    await post(`/api/conversations/${conversation.id}/reactions`, { messageId, emoji });
    setActiveMessageId(null);
  };

  const handleCopy = async (message) => {
    if (!message.text) return;
    try {
      await navigator.clipboard.writeText(message.text);
    } catch {
      // ignore clipboard failures
    }
    setActiveMessageId(null);
  };

  const openMessageMenu = (messageId) => {
    setActiveMessageId((current) => (current === messageId ? null : messageId));
  };

  const handleMessageListScroll = () => {
    const list = listRef.current;
    if (!list) return;
    const distanceFromBottom = list.scrollHeight - list.scrollTop - list.clientHeight;
    shouldStickToBottomRef.current = distanceFromBottom < 140;
  };

  const handleLoadOlderMessages = async () => {
    if (!hasMore) return;
    const list = listRef.current;
    const previousHeight = list?.scrollHeight || 0;
    const previousTop = list?.scrollTop || 0;
    await onLoadOlder?.();
    requestAnimationFrame(() => {
      if (!listRef.current) return;
      const nextHeight = listRef.current.scrollHeight;
      listRef.current.scrollTop = nextHeight - previousHeight + previousTop;
    });
  };

  return (
    <section className="chat-window card refined-chat-window chat-standalone-page">
      <header className="chat-header streamlined-chat-header">
        <div className="chat-header-main">
          <button type="button" className="ghost-button compact" onClick={onBack}>{locale === 'ar' ? '← العودة' : '← Back'}</button>
          <div className="conversation-avatar-wrap">
            <Avatar src={conversation.avatarUrl} name={conversation.title} size={50} />
          </div>
          <div>
            <h2>{conversation.title}</h2>
            <p>{typingState || presenceLabel(locale, conversation, onlineUserIds, currentUser?.id)}</p>
          </div>
        </div>

        {conversation.type === 'direct' ? (
          <div className="chat-header-actions minimal-actions">
            <button className="ghost-button compact icon-button" onClick={() => onStartCall('audio')} title={t(locale, 'audio')}>📞</button>
            <button className="ghost-button compact icon-button" onClick={() => onStartCall('video')} title={t(locale, 'video')}>🎥</button>
          </div>
        ) : null}
      </header>

      <div className="chat-stream-panel solo-stream-panel">
        <div className="message-list polished-message-list" ref={listRef} onScroll={handleMessageListScroll}>
          {hasMore && <button type="button" className="ghost-button load-older" onClick={handleLoadOlderMessages}>{t(locale, 'loadOlder')}</button>}
          {messages.map((message) => {
            const mine = message.senderId === currentUser?.id;
            const canEdit = mine && !message.deletedAt && message.type === 'text';
            const canDelete = mine || ['owner', 'admin'].includes(conversation.myRole);
            const active = activeMessageId === message.id;

            return (
              <div key={message.id} className={`message-row ${mine ? 'mine' : ''}`}>
                {!mine && <Avatar src={message.senderAvatar} name={message.senderName} size={36} />}
                <div className={`message-shell ${mine ? 'mine' : ''}`}>
                  <div
                    role="button"
                    tabIndex={0}
                    className={`message-bubble ${mine ? 'mine' : ''} ${message.starred ? 'is-starred' : ''} ${active ? 'is-active' : ''}`}
                    onClick={() => openMessageMenu(message.id)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter' || event.key === ' ') {
                        event.preventDefault();
                        openMessageMenu(message.id);
                      }
                    }}
                  >
                    {!mine && <strong className="sender-line">{message.senderName}</strong>}
                    {message.replyTo && (
                      <button type="button" className="reply-preview" onClick={(event) => event.stopPropagation()}>
                        <strong>{message.replyTo.senderName}</strong>
                        <span>{message.replyTo.text || message.replyTo.mediaName || message.replyTo.type}</span>
                      </button>
                    )}

                    {editingId === message.id ? (
                      <div className="edit-box" onClick={(event) => event.stopPropagation()}>
                        <textarea value={editText} onChange={(e) => setEditText(e.target.value)} rows={2} />
                        <div className="message-actions-inline">
                          <button type="button" className="primary-button compact" onClick={() => { onEditMessage(message.id, editText); setEditingId(null); }}>{t(locale, 'save')}</button>
                          <button type="button" className="ghost-button compact" onClick={() => setEditingId(null)}>{t(locale, 'cancel')}</button>
                        </div>
                      </div>
                    ) : (
                      <>
                        {message.text && <p>{message.text}</p>}
                        {message.type === 'audio' && message.meta?.durationSec ? <div className="voice-note-caption">{formatDuration(message.meta.durationSec)} · {message.meta?.label || (locale === 'ar' ? 'رسالة صوتية' : 'Voice note')}</div> : null}
                        <MessageMedia message={message} />
                      </>
                    )}

                    <div className="message-footer cleaner-message-footer">
                      <span>{formatTime(message.createdAt)}{message.editedAt ? ' · edited' : ''}{mine ? (message.readByOthers ? ' ✓✓' : ' ✓') : ''}</span>
                      {message.reactions?.length ? (
                        <div className="message-reactions passive">
                          {message.reactions.map((reaction) => <span key={reaction.id}>{reaction.emoji}</span>)}
                        </div>
                      ) : null}
                    </div>
                  </div>

                  {active && (
                    <div className={`message-action-popover ${mine ? 'mine' : ''}`}>
                      <div className="message-reactions quick-row">
                        {quickReactions.map((emoji) => (
                          <button key={`${message.id}-${emoji}`} type="button" onClick={() => handleReaction(message.id, emoji)}>{emoji}</button>
                        ))}
                      </div>
                      <div className="message-option-grid">
                        <button type="button" className="ghost-inline" onClick={() => handleReply(message)}>{actionLabel(locale, message)}</button>
                        {message.text ? <button type="button" className="ghost-inline" onClick={() => handleCopy(message)}>{t(locale, 'copyText')}</button> : null}
                        <button type="button" className="ghost-inline" onClick={() => { onForwardMessage(message.id); setActiveMessageId(null); }}>{t(locale, 'forward')}</button>
                        <button type="button" className="ghost-inline" onClick={() => { onToggleStar(message.id); setActiveMessageId(null); }}>{t(locale, message.starred ? 'unstar' : 'star')}</button>
                        {canEdit && <button type="button" className="ghost-inline" onClick={() => { setEditingId(message.id); setEditText(message.text || ''); setActiveMessageId(null); }}>{t(locale, 'edit')}</button>}
                        {canDelete && <button type="button" className="ghost-inline danger" onClick={() => { onDeleteMessage(message.id); setActiveMessageId(null); }}>{t(locale, 'delete')}</button>}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            );
          })}

          {!messages.length && (
            <div className="empty-state enhanced-empty">
              <div className="empty-illustration">✨</div>
              <strong>{t(locale, 'noMessagesYet')}</strong>
            </div>
          )}
          <div ref={bottomAnchorRef} className="message-bottom-anchor" />
        </div>
      </div>

      <div ref={composerAnchorRef}>
        <Composer locale={locale} onSend={onSend} onTyping={onTyping} replyTo={replyTo} onCancelReply={() => setReplyTo(null)} conversationId={conversation.id} />
      </div>
    </section>
  );
}
