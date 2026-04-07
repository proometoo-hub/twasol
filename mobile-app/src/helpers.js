export function conversationTitle(conversation, myUserId) {
  if (!conversation) return 'محادثة';
  if (conversation.name) return conversation.name;
  const other = (conversation.members || []).find((m) => m.user?.id !== myUserId);
  return other?.user?.name || 'محادثة خاصة';
}

export function conversationSubtitle(conversation, myUserId) {
  if (!conversation) return '';
  const last = conversation.messages?.[0];
  if (last?.text) return last.text;
  if (last?.type === 'image') return '📷 صورة';
  if (last?.type === 'video') return '🎬 فيديو';
  if (last?.type === 'voice') return '🎤 رسالة صوتية';
  if (last?.fileName) return `📎 ${last.fileName}`;
  if (!conversation.name) {
    const other = (conversation.members || []).find((m) => m.user?.id !== myUserId);
    return other?.user?.status === 'online' ? 'متصل الآن' : 'اضغط لفتح المحادثة';
  }
  return conversation.isChannel ? 'قناة' : conversation.isGroup ? `${conversation.members?.length || 0} أعضاء` : '';
}

export function formatTime(value) {
  if (!value) return '';
  const date = new Date(value);
  return new Intl.DateTimeFormat('ar', { hour: 'numeric', minute: '2-digit' }).format(date);
}

export function bubbleTime(value) {
  if (!value) return '';
  const date = new Date(value);
  return new Intl.DateTimeFormat('ar', { hour: 'numeric', minute: '2-digit' }).format(date);
}

export function initials(name) {
  return String(name || 'ت').split(' ').filter(Boolean).slice(0, 2).map((x) => x[0]).join('').toUpperCase();
}
