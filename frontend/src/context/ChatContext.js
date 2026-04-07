import React, { createContext, useContext, useState, useEffect, useRef, useCallback } from 'react';
import api from '../api';
import { useAuth } from './AuthContext';
import { useSocket } from './SocketContext';
import useNotification from '../hooks/useNotification';
import usePushNotifications from '../hooks/usePushNotifications';

const ChatContext = createContext(null);

export function ChatProvider({ children }) {
  const { user, isLoggedIn } = useAuth();
  const socketRef = useSocket();
  const playNotif = useNotification();
  const pushNotify = usePushNotifications();

  const [conversations, setConversations] = useState([]);
  const [activeChat, setActiveChat] = useState(null);
  const [messages, setMessages] = useState([]);
  const [typingUsers, setTypingUsers] = useState({});
  const [unreadCounts, setUnreadCounts] = useState({});
  const [hasMoreMessages, setHasMoreMessages] = useState(true);
  const [loadingOlder, setLoadingOlder] = useState(false);

  const activeChatRef = useRef(null);
  useEffect(() => { activeChatRef.current = activeChat; }, [activeChat]);

  const fetchConversations = useCallback(async () => { try { const r = await api.get('/rooms/my'); setConversations(r.data); } catch {} }, []);
  const fetchUnread = useCallback(async () => { try { const r = await api.get('/messages/unread/counts'); setUnreadCounts(r.data); } catch {} }, []);
  const fetchMessages = useCallback(async (convId) => { try { const r = await api.get(`/messages/${convId}`); setMessages(r.data); setHasMoreMessages(r.data.length >= 50); } catch {} }, []);

  const selectChat = useCallback((chat) => {
    setActiveChat(chat); setMessages([]); setHasMoreMessages(true); fetchMessages(chat.id);
    setUnreadCounts(prev => { const n = { ...prev }; delete n[chat.id]; return n; });
    const s = socketRef.current;
    if (s) { s.emit('join_conversation', chat.id); s.emit('mark_read', { conversationId: chat.id }); }
  }, [fetchMessages, socketRef]);

  const closeChat = useCallback(() => { setActiveChat(null); setHasMoreMessages(true); }, []);


  const openConversationById = useCallback(async (conversationId) => {
    const numericConversationId = Number(conversationId);
    if (!numericConversationId) return false;
    let list = conversations;
    if (!list.length) {
      try {
        const r = await api.get('/rooms/my');
        list = r.data || [];
        setConversations(list);
      } catch {
        return false;
      }
    }
    const match = list.find((item) => Number(item.id) === numericConversationId);
    if (!match) return false;
    selectChat(match);
    return true;
  }, [conversations, selectChat]);

  // Load older messages (pagination)
  const loadOlderMessages = useCallback(async () => {
    if (!activeChatRef.current || messages.length === 0 || loadingOlder || !hasMoreMessages) return false;
    const oldest = messages[0];
    setLoadingOlder(true);
    try {
      const r = await api.get(`/messages/${activeChatRef.current.id}?before=${oldest.id}`);
      if (r.data.length === 0) { setHasMoreMessages(false); return false; }
      setMessages(prev => [...r.data, ...prev]);
      if (r.data.length < 50) setHasMoreMessages(false);
      return true;
    } catch { return false; } finally { setLoadingOlder(false); }
  }, [messages, loadingOlder, hasMoreMessages]);

  useEffect(() => { if (isLoggedIn) { fetchConversations(); fetchUnread(); } }, [isLoggedIn, fetchConversations, fetchUnread]);

  useEffect(() => {
    const socket = socketRef.current;
    if (!socket || !user) return;

    const onConnect = () => { if (activeChatRef.current) socket.emit('join_conversation', activeChatRef.current.id); };

    const onNewMessage = (msg) => {
      const cur = activeChatRef.current;
      if (cur && msg.conversationId === cur.id) {
        setMessages(prev => prev.find(m => m.id === msg.id) ? prev : [...prev, msg]);
        if (msg.senderId !== user.id) socket.emit('mark_read', { conversationId: cur.id });
      } else if (msg.senderId !== user.id) {
        playNotif();
        pushNotify(
          msg.sender?.name || 'رسالة جديدة',
          msg.text || msg.type || 'مرفق',
          msg.sender?.avatar,
          { conversationId: msg.conversationId, messageId: msg.id, tag: `conv-${msg.conversationId}` }
        );
        setUnreadCounts(prev => ({ ...prev, [msg.conversationId]: (prev[msg.conversationId] || 0) + 1 }));
      }
      fetchConversations();
    };

    const onDeleted = ({ messageId, conversationId }) => {
      if (activeChatRef.current?.id === conversationId)
        setMessages(prev => prev.map(m => m.id === messageId ? { ...m, isDeleted: true, text: null, fileUrl: null } : m));
      fetchConversations();
    };

    const onBulkDeleted = ({ messageIds, conversationId }) => {
      if (activeChatRef.current?.id === conversationId)
        setMessages(prev => prev.map(m => messageIds.includes(m.id) ? { ...m, isDeleted: true, text: null, fileUrl: null } : m));
      fetchConversations();
    };

    const onReactions = ({ messageId, conversationId, reactions }) => {
      if (activeChatRef.current?.id === conversationId)
        setMessages(prev => prev.map(m => m.id === messageId ? { ...m, reactions } : m));
    };

    const onRead = ({ conversationId, readBy }) => {
      if (activeChatRef.current?.id === conversationId && readBy !== user.id)
        setMessages(prev => prev.map(m => m.senderId === user.id ? { ...m, isRead: true } : m));
      if (readBy === user.id) setUnreadCounts(prev => { const n = { ...prev }; delete n[conversationId]; return n; });
    };

    const onPinned = ({ messageId, conversationId, isPinned }) => {
      if (activeChatRef.current?.id === conversationId)
        setMessages(prev => prev.map(m => m.id === messageId ? { ...m, isPinned } : m));
    };

    const onEdited = (updated) => {
      if (activeChatRef.current?.id === updated.conversationId)
        setMessages(prev => prev.map(m => m.id === updated.id ? { ...m, ...updated } : m));
      fetchConversations();
    };

    const onTyping = ({ userId, conversationId, isTyping }) => {
      setTypingUsers(prev => ({ ...prev, [userId]: { conversationId, isTyping } }));
      if (isTyping) setTimeout(() => setTypingUsers(prev => { const n = { ...prev }; if (n[userId]?.conversationId === conversationId) n[userId] = { ...n[userId], isTyping: false }; return n; }), 3000);
    };

    const onStatus = ({ userId, status }) => {
      setConversations(prev => prev.map(c => ({ ...c, members: c.members.map(m => m.userId === userId ? { ...m, user: { ...m.user, status } } : m) })));
      if (activeChatRef.current?.userId === userId) setActiveChat(prev => prev ? { ...prev, status } : null);
    };

    socket.on('connect', onConnect);
    socket.on('new_message', onNewMessage);
    socket.on('message_deleted', onDeleted);
    socket.on('messages_bulk_deleted', onBulkDeleted);
    socket.on('reactions_updated', onReactions);
    socket.on('messages_read', onRead);
    socket.on('message_pinned', onPinned);
    socket.on('message_edited', onEdited);
    socket.on('user_typing', onTyping);
    socket.on('user_status', onStatus);
    socket.on('group_updated', fetchConversations);
    socket.on('forward_complete', () => {});

    return () => {
      socket.off('connect', onConnect); socket.off('new_message', onNewMessage);
      socket.off('message_deleted', onDeleted); socket.off('messages_bulk_deleted', onBulkDeleted);
      socket.off('reactions_updated', onReactions); socket.off('messages_read', onRead);
      socket.off('message_pinned', onPinned); socket.off('message_edited', onEdited); socket.off('user_typing', onTyping);
      socket.off('user_status', onStatus); socket.off('group_updated', fetchConversations);
      socket.off('forward_complete', () => {});
    };
  }, [socketRef.current, user, fetchConversations, playNotif, pushNotify]);



  useEffect(() => {
    const handleOpenConversation = async (event) => {
      const conversationId = event?.detail?.conversationId;
      if (!conversationId) return;
      await openConversationById(conversationId);
    };
    window.addEventListener('twasol-open-conversation', handleOpenConversation);
    return () => window.removeEventListener('twasol-open-conversation', handleOpenConversation);
  }, [openConversationById]);
  const totalUnread = Object.values(unreadCounts).reduce((a, b) => a + b, 0);

  return (
    <ChatContext.Provider value={{
      conversations, activeChat, messages, typingUsers, unreadCounts, totalUnread,
      hasMoreMessages, loadingOlder,
      selectChat, closeChat, fetchConversations, fetchMessages, setMessages, loadOlderMessages, openConversationById
    }}>
      {children}
    </ChatContext.Provider>
  );
}

export function useChat() {
  const ctx = useContext(ChatContext);
  if (!ctx) throw new Error('useChat must be inside ChatProvider');
  return ctx;
}
