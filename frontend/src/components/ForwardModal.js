import React, { useMemo, useState } from 'react';
import { X, Check, Send } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useChat } from '../context/ChatContext';
import { useSocket } from '../context/SocketContext';
import Avatar from './Avatar';

export default function ForwardModal({ message, messages, onClose }) {
  const { user } = useAuth();
  const { conversations, activeChat } = useChat();
  const socketRef = useSocket();
  const [selected, setSelected] = useState([]);
  const [sent, setSent] = useState(false);

  const list = useMemo(() => {
    if (Array.isArray(messages) && messages.length) return messages;
    return message ? [message] : [];
  }, [message, messages]);

  const toggle = (id) => setSelected(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);

  const forward = () => {
    if (!selected.length || !socketRef.current || !list.length) return;
    socketRef.current.emit('forward_message', {
      messageId: list.length === 1 ? list[0].id : undefined,
      messageIds: list.map(m => m.id),
      targetConversationIds: selected
    });
    setSent(true);
    setTimeout(onClose, 1000);
  };

  const getName = (conv) => {
    if (conv.isGroup || conv.isChannel) return conv.name;
    const other = conv.members?.find(m => m.userId !== user.id)?.user;
    return other?.name || 'محادثة';
  };

  const preview = list.length === 1
    ? (list[0]?.text || list[0]?.fileName || 'مرفق')
    : `${list.length} رسائل محددة`;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()} style={{ width: 420 }}>
        <h3>{list.length > 1 ? 'إعادة توجيه الرسائل المحددة' : 'إعادة توجيه الرسالة'}</h3>
        <div style={{ padding: '10px 12px', background: 'var(--bg-tertiary)', borderRadius: 10, marginBottom: 14, fontSize: 13, color: 'var(--text-secondary)' }}>
          {preview}
        </div>
        {sent ? (
          <div style={{ padding: 30, color: 'var(--accent)', textAlign: 'center' }}><Check size={48} /><div style={{ marginTop: 10 }}>تم الإرسال</div></div>
        ) : (
          <>
            <div style={{ maxHeight: 350, overflowY: 'auto', marginBottom: 16 }}>
              {conversations.filter(conv => conv.id !== activeChat?.id).map(conv => (
                <div key={conv.id} className={`user-select-item ${selected.includes(conv.id) ? 'selected' : ''}`} onClick={() => toggle(conv.id)}>
                  <Avatar src={conv.avatar || conv.image} name={getName(conv)} size={40} />
                  <div style={{ flex: 1, fontWeight: 500 }}>{getName(conv)}</div>
                  {selected.includes(conv.id) && <Check size={18} color="var(--accent)" />}
                </div>
              ))}
            </div>
            <div className="modal-actions">
              <button onClick={onClose} style={{ background: 'var(--bg-tertiary)', color: 'var(--text-primary)' }}>إلغاء</button>
              <button onClick={forward} disabled={!selected.length}
                style={{ background: selected.length ? 'var(--accent)' : 'var(--bg-tertiary)', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
                <Send size={16} /> إرسال ({selected.length})
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
