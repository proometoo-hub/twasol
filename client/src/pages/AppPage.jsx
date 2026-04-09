import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { io } from 'socket.io-client';
import { useLocation, useNavigate } from 'react-router-dom';
import { get, post, put, remove } from '../api/client';
import NewConversationModal from '../components/NewConversationModal';
import ProfilePanel from '../components/ProfilePanel';
import CallOverlay from '../components/CallOverlay';
import { useAuth } from '../context/AuthContext';
import { t } from '../i18n/strings';
import HomeDashboardPage from './sections/HomeDashboardPage';
import ChatsWorkspacePage from './sections/ChatsWorkspacePage';
import CallsWorkspacePage from './sections/CallsWorkspacePage';
import GroupsWorkspacePage from './sections/GroupsWorkspacePage';
import DiscoverWorkspacePage from './sections/DiscoverWorkspacePage';
import SettingsWorkspacePage from './sections/SettingsWorkspacePage';

const configuredTurnServers = [
  import.meta.env.VITE_TURN_URL
    ? {
        urls: import.meta.env.VITE_TURN_URL,
        username: import.meta.env.VITE_TURN_USERNAME || undefined,
        credential: import.meta.env.VITE_TURN_CREDENTIAL || undefined,
      }
    : null,
].filter(Boolean);

const rtcConfig = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    ...configuredTurnServers,
  ],
};

const navItems = [
  { key: 'home', path: '/home', emoji: '🏠' },
  { key: 'chats', path: '/chats', emoji: '💬' },
  { key: 'calls', path: '/calls', emoji: '📞' },
  { key: 'groups', path: '/groups', emoji: '👥' },
  { key: 'discover', path: '/discover', emoji: '✨' },
  { key: 'settings', path: '/settings', emoji: '⚙️' },
];

const sectionTitleMap = {
  home: { ar: 'الرئيسية', en: 'Home' },
  chats: { ar: 'المحادثات', en: 'Chats' },
  calls: { ar: 'المكالمات', en: 'Calls' },
  groups: { ar: 'المجموعات', en: 'Groups' },
  discover: { ar: 'الاستكشاف', en: 'Discover' },
  settings: { ar: 'الإعدادات', en: 'Settings' },
};

const sectionSubtitleMap = {
  home: { ar: 'اختصارات هادئة ونظيفة للبدء السريع.', en: 'A calmer starting point for your day.' },
  chats: { ar: 'كل ما يخص المحادثات في صفحات مخصصة بدون ازدحام.', en: 'Chat-focused pages without clutter.' },
  calls: { ar: 'ابدأ المكالمات وراجع السجل من صفحة مستقلة.', en: 'Calls and history in a dedicated page.' },
  groups: { ar: 'المجموعات والقنوات مرتبة في مساحة منفصلة.', en: 'Groups and channels in a separate space.' },
  discover: { ar: 'الحالات والوسائط في صفحة خفيفة.', en: 'Statuses and media in a lighter page.' },
  settings: { ar: 'الإعدادات والخصوصية بعيدًا عن الدردشة.', en: 'Settings and privacy away from chat.' },
};

function WorkspaceShell({
  locale,
  currentUser,
  section,
  navigate,
  children,
  logout,
  unreadCount,
  socketStatus,
  chatFocus,
}) {
  return (
    <div className={`minimal-shell ${chatFocus ? 'chat-focus' : ''}`}>
      <aside className="minimal-rail card">
        <button type="button" className="rail-logo" onClick={() => navigate('/home')}>ت</button>

        <nav className="minimal-nav">
          {navItems.map((item) => (
            <button
              key={item.key}
              type="button"
              className={`minimal-nav-item ${section === item.key ? 'is-active' : ''}`}
              onClick={() => navigate(item.path)}
              title={sectionTitleMap[item.key][locale] || sectionTitleMap[item.key].ar}
            >
              <span className="minimal-nav-emoji">{item.emoji}</span>
              {item.key === 'chats' && unreadCount > 0 ? <span className="minimal-nav-count">{unreadCount}</span> : null}
            </button>
          ))}
        </nav>

        <div className="minimal-rail-footer">
          <button type="button" className="rail-user" onClick={() => navigate('/settings')} title={currentUser?.displayName || 'User'}>
            {(currentUser?.displayName || 'U').slice(0, 1)}
          </button>
          <div className={`rail-status ${socketStatus === 'connected' ? 'is-online' : ''}`} title={socketStatus === 'connected' ? t(locale, 'connected') : t(locale, 'connecting')} />
          <button
            type="button"
            className="ghost-button rail-logout icon-only"
            onClick={logout}
            title={locale === 'ar' ? 'تسجيل الخروج' : 'Logout'}
            aria-label={locale === 'ar' ? 'تسجيل الخروج' : 'Logout'}
          >
            ⎋
          </button>
        </div>
      </aside>

      <main className={`minimal-main ${chatFocus ? 'is-chat-focus' : ''}`}>
        {!chatFocus ? (
          <header className="minimal-page-head">
            <div>
              <span className="page-kicker">Tawasol</span>
              <h1>{sectionTitleMap[section][locale] || sectionTitleMap[section].ar}</h1>
              <p>{sectionSubtitleMap[section][locale] || sectionSubtitleMap[section].ar}</p>
            </div>
            <button type="button" className="minimal-user-pill" onClick={() => navigate('/settings')}>
              <div className="workspace-user-avatar">{(currentUser?.displayName || 'U').slice(0, 1)}</div>
              <div>
                <strong>{currentUser?.displayName}</strong>
                <span>@{currentUser?.username}</span>
              </div>
            </button>
          </header>
        ) : null}

        <div className={`minimal-page-body ${chatFocus ? 'is-chat-focus' : ''}`}>{children}</div>
      </main>

      <nav className="minimal-mobile-nav card">
        {navItems.map((item) => (
          <button key={item.key} type="button" className={section === item.key ? 'is-active' : ''} onClick={() => navigate(item.path)}>
            <span>{item.emoji}</span>
          </button>
        ))}
      </nav>
    </div>
  );
}

export default function AppPage() {
  const { user, token, updateUser, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const [conversations, setConversations] = useState([]);
  const [statuses, setStatuses] = useState([]);
  const [blockedUsers, setBlockedUsers] = useState([]);
  const [users, setUsers] = useState([]);
  const [search, setSearch] = useState('');
  const [filterTab, setFilterTab] = useState('all');
  const [activeConversationId, setActiveConversationId] = useState(null);
  const [messages, setMessages] = useState([]);
  const [messageCursor, setMessageCursor] = useState(null);
  const [hasMoreMessages, setHasMoreMessages] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [modalPreset, setModalPreset] = useState('direct');
  const [joinCode, setJoinCode] = useState('');
  const [showProfile, setShowProfile] = useState(false);
  const [callState, setCallState] = useState(null);
  const [callHistory, setCallHistory] = useState([]);
  const [onlineUserIds, setOnlineUserIds] = useState([]);
  const [typingMap, setTypingMap] = useState({});
  const [toast, setToast] = useState('');
  const [socketStatus, setSocketStatus] = useState('connecting');
  const [refreshing, setRefreshing] = useState(true);
  const [coreError, setCoreError] = useState('');
  const refreshCoreRef = useRef(null);
  const socketRef = useRef(null);
  const peerRef = useRef(null);
  const callStateRef = useRef(null);
  const queuedOfferRef = useRef(null);
  const pendingCandidatesRef = useRef([]);
  const conversationsRef = useRef([]);
  const activeConversationIdRef = useRef(null);
  const callTimeoutRef = useRef(null);
  const reconnectGraceRef = useRef(null);

  const locale = user?.locale || 'ar';
  const pathParts = useMemo(() => location.pathname.split('/').filter(Boolean), [location.pathname]);
  const section = useMemo(() => {
    const first = pathParts[0] || 'home';
    return navItems.some((item) => item.key === first) ? first : 'home';
  }, [pathParts]);
  const routeConversationId = useMemo(() => (section === 'chats' ? pathParts[1] || null : null), [pathParts, section]);
  const isConversationRoute = section === 'chats' && Boolean(routeConversationId);

  const activeConversation = useMemo(() => conversations.find((item) => item.id === activeConversationId) || null, [conversations, activeConversationId]);
  const stats = useMemo(() => ({
    unread: conversations.reduce((sum, item) => sum + Number(item.unreadCount || 0), 0),
    pinned: conversations.filter((item) => item.pinned).length,
    active: onlineUserIds.length,
    messages: messages.length,
    groups: conversations.filter((item) => item.type === 'group').length,
    channels: conversations.filter((item) => item.type === 'channel').length,
  }), [conversations, onlineUserIds.length, messages.length]);
  const directConversations = useMemo(() => conversations.filter((item) => item.type === 'direct'), [conversations]);
  const groupedConversations = useMemo(() => conversations.filter((item) => ['group', 'channel'].includes(item.type)), [conversations]);

  useEffect(() => { conversationsRef.current = conversations; }, [conversations]);
  useEffect(() => { activeConversationIdRef.current = activeConversationId; }, [activeConversationId]);
  useEffect(() => { callStateRef.current = callState; }, [callState]);
  useEffect(() => {
    if (!toast) return undefined;
    const timer = setTimeout(() => setToast(''), 2600);
    return () => clearTimeout(timer);
  }, [toast]);

  const refreshCore = useCallback(async () => {
    setRefreshing(true);
    setCoreError('');
    try {
      const [conversationData, statusData, userData, blockedData] = await Promise.all([
        get('/api/conversations'),
        get('/api/statuses'),
        get('/api/users?q='),
        get('/api/users/blocked'),
      ]);
      const nextConversations = conversationData.conversations || [];
      const nextStatuses = statusData.statuses || [];
      const nextUsers = userData.users || [];
      const nextBlockedUsers = blockedData.users || [];
      setConversations(nextConversations);
      setStatuses(nextStatuses);
      setUsers(nextUsers);
      setBlockedUsers(nextBlockedUsers);
      return { conversations: nextConversations, statuses: nextStatuses, users: nextUsers, blockedUsers: nextBlockedUsers };
    } catch (error) {
      console.error('refreshCore failed', error);
      setCoreError(error?.message || 'Could not refresh workspace');
      return null;
    } finally {
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { refreshCoreRef.current = refreshCore; }, [refreshCore]);

  const scheduleCoreRefresh = useCallback(() => {
    window.clearTimeout(window.__tawasolRefreshTimer);
    window.__tawasolRefreshTimer = window.setTimeout(() => {
      refreshCoreRef.current?.().catch(() => {});
    }, 120);
  }, []);

  const loadMessages = useCallback(async (conversationId, mode = 'replace') => {
    if (!conversationId) return;
    try {
      const cursor = mode === 'older' ? messageCursor : null;
      const data = await get(`/api/conversations/${conversationId}/messages?limit=35${cursor ? `&before=${encodeURIComponent(cursor)}` : ''}`);
      const nextMessages = Array.isArray(data.messages) ? data.messages : [];
      setHasMoreMessages(Boolean(data.hasMore));
      setMessageCursor(data.nextCursor);
      setMessages((current) => (mode === 'older' ? [...nextMessages, ...current] : nextMessages));
      const lastIncoming = [...nextMessages].reverse().find((item) => item.senderId !== user?.id);
      if (lastIncoming) await post(`/api/conversations/${conversationId}/read`, { messageId: lastIncoming.id });
      const callData = await get(`/api/conversations/${conversationId}/calls`);
      setCallHistory(callData.calls || []);
    } catch (error) {
      console.error('loadMessages failed', error);
      setToast(locale === 'ar' ? 'تعذر تحميل الرسائل أو سجل المكالمات.' : 'Could not load messages or call history.');
    }
  }, [messageCursor, user?.id, locale]);

  useEffect(() => { refreshCore(); }, [refreshCore]);
  useEffect(() => {
    const timer = window.setInterval(() => {
      refreshCoreRef.current?.().catch(() => {});
    }, 30000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    if (section !== 'chats') return;
    if (!routeConversationId) {
      setActiveConversationId(null);
      setMessages([]);
      setCallHistory([]);
      setHasMoreMessages(false);
      setMessageCursor(null);
      return;
    }
    setActiveConversationId(routeConversationId);
  }, [routeConversationId, section]);

  useEffect(() => {
    if (activeConversationId) loadMessages(activeConversationId);
  }, [activeConversationId, loadMessages]);

  const mergeIncomingMessage = useCallback((incoming) => {
    if (!incoming) return;
    setMessages((current) => {
      const clientTempId = incoming?.meta?.clientTempId;
      if (clientTempId) {
        const tempIndex = current.findIndex((item) => item.id?.startsWith?.('temp_') && item?.meta?.clientTempId === clientTempId);
        if (tempIndex !== -1) {
          const next = [...current];
          next[tempIndex] = incoming;
          return next;
        }
      }
      return current.some((item) => item.id === incoming.id) ? current.map((item) => (item.id === incoming.id ? incoming : item)) : [...current, incoming];
    });
  }, []);

  useEffect(() => {
    document.documentElement.dir = locale === 'ar' ? 'rtl' : 'ltr';
    document.documentElement.lang = locale;
    document.body.dataset.theme = user?.theme || 'dark';
  }, [locale, user?.theme]);

  const stopCallTimeout = useCallback(() => {
    if (callTimeoutRef.current) {
      clearTimeout(callTimeoutRef.current);
      callTimeoutRef.current = null;
    }
  }, []);

  const closePeer = useCallback(() => {
    if (reconnectGraceRef.current) {
      clearTimeout(reconnectGraceRef.current);
      reconnectGraceRef.current = null;
    }
    peerRef.current?.close();
    peerRef.current = null;
    pendingCandidatesRef.current = [];
    queuedOfferRef.current = null;
  }, []);

  const endCall = useCallback((shouldNotify = true, finalStatus = 'ended') => {
    stopCallTimeout();
    if (callState?.callId && callState?.conversation?.id && shouldNotify) {
      socketRef.current?.emit('call:status', {
        callId: callState.callId,
        conversationId: callState.conversation.id,
        status: finalStatus,
        toUserId: callState.peer?.id,
      });
      socketRef.current?.emit('call:end', { callId: callState.callId, conversationId: callState.conversation.id });
    }
    callState?.localStream?.getTracks?.().forEach((track) => track.stop());
    callState?.remoteStream?.getTracks?.().forEach((track) => track.stop());
    closePeer();
    setCallState(null);
    setTimeout(() => refreshCore().catch(() => {}), 50);
  }, [callState, closePeer, refreshCore, stopCallTimeout]);

  const rejectCall = useCallback(() => {
    if (callState?.callId && callState?.peer?.id) socketRef.current?.emit('call:reject', { callId: callState.callId, toUserId: callState.peer.id });
    endCall(false, 'rejected');
  }, [callState, endCall]);

  const ensurePeer = useCallback((otherUserId, callId) => {
    if (peerRef.current) return peerRef.current;
    const connection = new RTCPeerConnection(rtcConfig);
    peerRef.current = connection;
    connection.onicecandidate = (event) => {
      if (event.candidate) socketRef.current?.emit('call:ice', { callId, candidate: event.candidate, toUserId: otherUserId });
    };
    connection.ontrack = (event) => {
      const [stream] = event.streams;
      stopCallTimeout();
      setCallState((current) => (current ? { ...current, remoteStream: stream, status: 'connected', startedAt: current.startedAt || new Date().toISOString() } : current));
    };
    connection.onconnectionstatechange = () => {
      if (connection.connectionState === 'connected') {
        if (reconnectGraceRef.current) {
          clearTimeout(reconnectGraceRef.current);
          reconnectGraceRef.current = null;
        }
        stopCallTimeout();
        setCallState((current) => (current ? { ...current, status: 'connected', startedAt: current.startedAt || new Date().toISOString() } : current));
        return;
      }
      if (connection.connectionState === 'disconnected') {
        if (reconnectGraceRef.current) clearTimeout(reconnectGraceRef.current);
        reconnectGraceRef.current = setTimeout(() => endCall(false), 6000);
        setCallState((current) => (current ? { ...current, status: 'connecting' } : current));
        return;
      }
      if (['failed', 'closed'].includes(connection.connectionState)) endCall(false);
    };
    return connection;
  }, [endCall, stopCallTimeout]);

  const prepareLocalMedia = useCallback(async (kind) => {
    if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
      throw new Error('secure-context-required');
    }
    try {
      return await navigator.mediaDevices.getUserMedia({ audio: true, video: kind === 'video' });
    } catch (error) {
      if (error?.name === 'NotAllowedError') throw new Error('media-permission-denied');
      if (error?.name === 'NotFoundError') throw new Error(kind === 'video' ? 'camera-not-found' : 'microphone-not-found');
      throw error;
    }
  }, []);

  const explainMediaError = useCallback((error, kind = 'audio') => {
    if (error?.message === 'secure-context-required') {
      return locale === 'ar'
        ? 'الكاميرا والميكروفون يحتاجان تشغيل التطبيق على localhost أو HTTPS مع السماح للإذن من المتصفح.'
        : 'Camera and microphone require localhost or HTTPS plus browser permission.';
    }
    if (error?.message === 'media-permission-denied') {
      return locale === 'ar'
        ? 'تم رفض إذن الكاميرا أو الميكروفون. افتح قفل الموقع في المتصفح ثم اسمح بالصوت والكاميرا.'
        : 'Camera or microphone permission was denied. Open the site permissions in your browser and allow them.';
    }
    if (error?.message === 'camera-not-found') return locale === 'ar' ? 'لا توجد كاميرا متاحة على هذا الجهاز.' : 'No camera was found on this device.';
    if (error?.message === 'microphone-not-found') return locale === 'ar' ? 'لا يوجد ميكروفون متاح على هذا الجهاز.' : 'No microphone was found on this device.';
    return locale === 'ar' ? 'تعذر تجهيز الكاميرا أو الميكروفون الآن.' : 'Could not prepare camera or microphone right now.';
  }, [locale]);

  const acceptIncomingCall = useCallback(async () => {
    if (!callState?.peer || !callState?.callId) return;
    try {
      const localStream = await prepareLocalMedia(callState.kind);
      const connection = ensurePeer(callState.peer.id, callState.callId);
      localStream.getTracks().forEach((track) => connection.addTrack(track, localStream));
      setCallState((current) => (current ? { ...current, localStream, status: 'connecting' } : current));
      if (queuedOfferRef.current) {
        await connection.setRemoteDescription(new RTCSessionDescription(queuedOfferRef.current));
        queuedOfferRef.current = null;
        const answer = await connection.createAnswer();
        await connection.setLocalDescription(answer);
        socketRef.current?.emit('call:answer', { callId: callState.callId, answer, toUserId: callState.peer.id });
        socketRef.current?.emit('call:status', { callId: callState.callId, conversationId: callState.conversation?.id, status: 'connecting', toUserId: callState.peer.id });
      }
      while (pendingCandidatesRef.current.length) {
        const candidate = pendingCandidatesRef.current.shift();
        await connection.addIceCandidate(new RTCIceCandidate(candidate));
      }
    } catch (error) {
      setToast(explainMediaError(error, callState.kind));
    }
  }, [callState, ensurePeer, explainMediaError, prepareLocalMedia]);

  const startCall = useCallback(async (kind) => {
    if (!activeConversation || activeConversation.type !== 'direct') {
      setToast(locale === 'ar' ? 'المكالمات الفردية فقط مفعلة الآن' : 'Only direct calls are enabled right now');
      return;
    }
    if (callStateRef.current) return;
    try {
      const otherUser = activeConversation.members.find((member) => member.id !== user.id);
      const localStream = await prepareLocalMedia(kind);
      const created = await post(`/api/conversations/${activeConversation.id}/calls`, { kind });
      const connection = ensurePeer(otherUser.id, created.callId);
      localStream.getTracks().forEach((track) => connection.addTrack(track, localStream));
      setCallState({ callId: created.callId, conversation: activeConversation, peer: otherUser, kind, status: 'calling', localStream, remoteStream: null, micMuted: false, cameraOff: false, startedAt: new Date().toISOString() });
      stopCallTimeout();
      callTimeoutRef.current = setTimeout(() => {
        setToast(locale === 'ar' ? 'تعذر الرد على المكالمة' : 'Call was not answered');
        endCall(true, 'missed');
      }, 35000);
      socketRef.current?.emit('call:start', { callId: created.callId, conversationId: activeConversation.id, kind });
      const offer = await connection.createOffer();
      await connection.setLocalDescription(offer);
      socketRef.current?.emit('call:offer', { callId: created.callId, conversationId: activeConversation.id, offer, kind, toUserId: otherUser.id });
    } catch (error) {
      setToast(explainMediaError(error, kind));
    }
  }, [activeConversation, ensurePeer, endCall, explainMediaError, locale, prepareLocalMedia, stopCallTimeout, user?.id]);

  useEffect(() => {
    if (!token) return undefined;
    const socket = io(import.meta.env.VITE_API_BASE || window.location.origin, { path: '/socket.io', auth: { token } });
    socketRef.current = socket;

    socket.on('connect', () => {
      setSocketStatus('connected');
      socket.emit('presence:ping');
      conversationsRef.current.forEach((conversation) => {
        socket.emit('conversation:join', { conversationId: conversation.id });
      });
      if (activeConversationIdRef.current) socket.emit('conversation:join', { conversationId: activeConversationIdRef.current });
    });
    socket.on('disconnect', () => setSocketStatus('connecting'));
    socket.on('connect_error', () => {
      setSocketStatus('connecting');
      setToast(locale === 'ar' ? 'تعذر الاتصال اللحظي بالخادم. سأعيد المحاولة تلقائيًا.' : 'Realtime connection failed. Retrying automatically.');
    });
    socket.on('presence:snapshot', ({ onlineUserIds: ids }) => setOnlineUserIds(ids));
    socket.on('presence:update', ({ userId, isOnline, lastSeen }) => {
      setOnlineUserIds((current) => (isOnline ? Array.from(new Set([...current, userId])) : current.filter((item) => item !== userId)));
      setConversations((current) => current.map((conversation) => ({ ...conversation, members: conversation.members?.map((member) => (member.id === userId ? { ...member, lastSeen } : member)) })));
    });
    socket.on('typing:update', ({ conversationId, displayName, isTyping }) => {
      setTypingMap((current) => ({ ...current, [conversationId]: isTyping ? displayName : '' }));
    });
    socket.on('message:new', (message) => {
      if (message.conversationId === activeConversationIdRef.current) {
        mergeIncomingMessage(message);
        if (message.senderId !== user?.id) post(`/api/conversations/${message.conversationId}/read`, { messageId: message.id }).catch(() => {});
      }
      scheduleCoreRefresh();
      if (message.senderId !== user?.id && document.visibilityState !== 'visible' && 'Notification' in window && Notification.permission === 'granted') {
        new Notification(message.senderName, { body: message.text || message.mediaName || 'New message' });
      }
    });
    socket.on('message:update', (message) => {
      setMessages((current) => current.map((item) => (item.id === message.id ? message : item)));
      scheduleCoreRefresh();
    });
    socket.on('conversation:new', (conversation) => {
      socket.emit('conversation:join', { conversationId: conversation.id });
      setCoreError('');
      setConversations((current) => [conversation, ...current.filter((item) => item.id !== conversation.id)]);
    });
    socket.on('conversation:update', (conversation) => {
      socket.emit('conversation:join', { conversationId: conversation.id });
      setConversations((current) => {
        const next = current.some((item) => item.id === conversation.id) ? current.map((item) => (item.id === conversation.id ? conversation : item)) : [conversation, ...current];
        return [...next].sort((a, b) => Number(b.pinned) - Number(a.pinned) || String(b.lastMessageAt || b.createdAt).localeCompare(String(a.lastMessageAt || a.createdAt)));
      });
    });
    socket.on('status:update', () => {
      setCoreError('');
      scheduleCoreRefresh();
    });

    socket.on('call:incoming', ({ callId, conversationId, kind, from }) => {
      const conversation = conversationsRef.current.find((item) => item.id === conversationId) || null;
      if (callStateRef.current) {
        socket.emit('call:busy', { callId, toUserId: from.id });
        return;
      }
      setCallState({ callId, conversation, peer: { id: from.id, displayName: from.displayName, avatarUrl: from.avatarUrl }, kind, status: 'incoming', localStream: null, remoteStream: null, micMuted: false, cameraOff: false, startedAt: new Date().toISOString() });
    });
    socket.on('call:offer', ({ callId, conversationId, offer, fromUserId, from, kind }) => {
      queuedOfferRef.current = offer;
      const conversation = conversationsRef.current.find((item) => item.id === conversationId) || null;
      const peer = conversation?.members?.find((member) => member.id === fromUserId) || from || null;
      setCallState((current) => current || { callId, conversation, peer, kind: kind || 'video', status: 'incoming', localStream: null, remoteStream: null, micMuted: false, cameraOff: false, startedAt: new Date().toISOString() });
    });
    socket.on('call:answer', async ({ answer }) => {
      if (peerRef.current) {
        await peerRef.current.setRemoteDescription(new RTCSessionDescription(answer));
        while (pendingCandidatesRef.current.length) {
          const candidate = pendingCandidatesRef.current.shift();
          await peerRef.current.addIceCandidate(new RTCIceCandidate(candidate));
        }
        stopCallTimeout();
        setCallState((current) => (current ? { ...current, status: 'connecting', startedAt: current.startedAt || new Date().toISOString() } : current));
      }
    });
    socket.on('call:status', ({ status }) => {
      if (status === 'connecting') {
        stopCallTimeout();
        setCallState((current) => (current ? { ...current, status: 'connecting' } : current));
        return;
      }
      if (status === 'connected') {
        stopCallTimeout();
        setCallState((current) => (current ? { ...current, status: 'connected', startedAt: current.startedAt || new Date().toISOString() } : current));
        return;
      }
      if (['rejected', 'busy', 'missed', 'ended'].includes(status)) {
        if (status === 'missed') setToast(locale === 'ar' ? 'فاتتك المكالمة' : 'Missed call');
        endCall(false, status);
      }
    });
    socket.on('call:reject', () => { setToast(locale === 'ar' ? 'تم رفض المكالمة' : 'Call rejected'); endCall(false); });
    socket.on('call:busy', () => { setToast(locale === 'ar' ? 'الطرف الآخر مشغول' : 'The other side is busy'); endCall(false); });
    socket.on('call:ice', async ({ candidate }) => {
      if (peerRef.current?.remoteDescription) await peerRef.current.addIceCandidate(new RTCIceCandidate(candidate));
      else pendingCandidatesRef.current.push(candidate);
    });
    socket.on('call:end', () => endCall(false));

    return () => {
      socket.disconnect();
      stopCallTimeout();
      closePeer();
    };
  }, [token, refreshCore, endCall, closePeer, locale, user?.id, stopCallTimeout, mergeIncomingMessage]);

  useEffect(() => {
    if (socketStatus !== 'connected') return;
    conversations.forEach((conversation) => {
      socketRef.current?.emit('conversation:join', { conversationId: conversation.id });
    });
  }, [conversations, socketStatus]);

  useEffect(() => {
    if (!activeConversationId || socketStatus !== 'connected') return;
    socketRef.current?.emit('conversation:join', { conversationId: activeConversationId });
  }, [activeConversationId, socketStatus]);

  const sendMessage = async ({ text = '', type = 'text', file = null, replyToId = null, forwardedFromId = null, meta = null }) => {
    if (!activeConversationId) return;
    const conversationId = activeConversationId;
    const clientTempId = `temp_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const requestMeta = { ...(meta || {}), clientTempId };
    const replyTo = replyToId ? messages.find((item) => item.id === replyToId) || null : null;
    const optimisticMessage = !file && type === 'text' ? {
      id: clientTempId,
      conversationId,
      senderId: user?.id,
      senderName: user?.displayName,
      senderAvatar: user?.avatarUrl,
      type,
      text,
      mediaUrl: null,
      mediaName: null,
      mediaSize: null,
      replyToId: replyToId || null,
      forwardedFromId: forwardedFromId || null,
      editedAt: null,
      deletedAt: null,
      createdAt: new Date().toISOString(),
      starred: false,
      reactions: [],
      reads: [],
      meta: requestMeta,
      readByOthers: false,
      replyTo: replyTo ? {
        id: replyTo.id,
        text: replyTo.text,
        type: replyTo.type,
        mediaName: replyTo.mediaName,
        senderName: replyTo.senderName,
      } : null,
    } : null;

    if (optimisticMessage) mergeIncomingMessage(optimisticMessage);

    const form = new FormData();
    form.append('type', type);
    if (text) form.append('text', text);
    if (file) form.append('file', file);
    if (replyToId) form.append('replyToId', replyToId);
    if (forwardedFromId) form.append('forwardedFromId', forwardedFromId);
    form.append('meta', JSON.stringify(requestMeta));

    try {
      const data = await post(`/api/conversations/${conversationId}/messages`, form);
      if (data?.message && conversationId === activeConversationIdRef.current) mergeIncomingMessage(data.message);
      refreshConversation().catch(() => {});
      return data?.message;
    } catch (error) {
      if (optimisticMessage) setMessages((current) => current.filter((item) => item.id !== clientTempId));
      setToast(error?.message || (locale === 'ar' ? 'تعذر إرسال الرسالة الآن' : 'Could not send the message right now'));
      throw error;
    }
  };

  const handleConversationCreated = (conversation) => {
    setConversations((current) => [conversation, ...current.filter((item) => item.id !== conversation.id)]);
    socketRef.current?.emit('conversation:join', { conversationId: conversation.id });
    setActiveConversationId(conversation.id);
    setModalOpen(false);
    navigate(`/chats/${conversation.id}`);
  };

  const openConversation = useCallback((conversationId) => {
    socketRef.current?.emit('conversation:join', { conversationId });
    setActiveConversationId(conversationId);
    navigate(`/chats/${conversationId}`);
  }, [navigate]);

  const returnToChatList = useCallback(() => {
    navigate('/chats');
  }, [navigate]);

  const blockCurrent = async () => {
    const other = activeConversation?.members?.find((member) => member.id !== user.id);
    if (!other) return;
    await post(`/api/users/block/${other.id}`);
    await refreshCore();
  };

  const refreshBlockedUsers = useCallback(async () => {
    const blockedData = await get('/api/users/blocked');
    setBlockedUsers(blockedData.users);
  }, []);

  const refreshConversation = useCallback(async () => {
    if (!activeConversationId) return;
    const data = await get(`/api/conversations/${activeConversationId}`);
    setConversations((current) => current.map((item) => (item.id === activeConversationId ? data.conversation : item)));
  }, [activeConversationId]);

  const updateConversationPreference = async (payload) => {
    if (!activeConversationId) return;
    const data = await put(`/api/conversations/${activeConversationId}/preferences`, payload);
    setConversations((current) => current.map((item) => (item.id === activeConversationId ? data.conversation : item)));
  };

  const editMessage = async (messageId, text) => {
    const data = await put(`/api/conversations/${activeConversationId}/messages/${messageId}`, { text });
    setMessages((current) => current.map((item) => (item.id === messageId ? data.message : item)));
  };

  const deleteMessage = async (messageId) => {
    const data = await remove(`/api/conversations/${activeConversationId}/messages/${messageId}`);
    setMessages((current) => current.map((item) => (item.id === messageId ? data.message : item)));
  };

  const toggleStar = async (messageId) => {
    const data = await post(`/api/conversations/${activeConversationId}/messages/${messageId}/star`, {});
    setMessages((current) => current.map((item) => (item.id === messageId ? (data.message || { ...item, starred: data.starred }) : item)));
  };

  const forwardMessage = async (messageId) => {
    const target = window.prompt(locale === 'ar' ? 'أدخل ID المحادثة الهدف لإعادة التوجيه' : 'Enter target conversation ID to forward');
    if (!target) return;
    await post(`/api/conversations/${activeConversationId}/messages/${messageId}/forward`, { targetConversationId: target });
    setToast(locale === 'ar' ? 'تمت إعادة التوجيه' : 'Forwarded');
  };

  const manageConversation = async () => {
    if (!activeConversation) return;
    const maybeTitle = window.prompt(locale === 'ar' ? 'العنوان الجديد' : 'New title', activeConversation.rawTitle || activeConversation.title);
    if (maybeTitle === null) return;
    await put(`/api/conversations/${activeConversation.id}`, { title: maybeTitle });
    await refreshConversation();
  };

  const applyTheme = useCallback(async (theme) => {
    if (!theme || user?.theme === theme) return;
    try {
      document.body.dataset.theme = theme;
      const data = await put('/api/auth/me', { theme });
      updateUser(data.user);
      setToast(locale === 'ar' ? 'تم تغيير الثيم' : 'Theme updated');
    } catch (error) {
      document.body.dataset.theme = user?.theme || 'dark';
      setToast(error?.message || (locale === 'ar' ? 'تعذر تغيير الثيم الآن' : 'Could not change theme right now'));
    }
  }, [locale, updateUser, user?.theme]);

  const requestNotifications = async () => {
    if (!('Notification' in window)) return;
    const permission = await Notification.requestPermission();
    setToast(t(locale, permission === 'granted' ? 'notificationsReady' : 'notificationsDenied'));
  };

  const loadOlder = async () => {
    if (!activeConversationId || !hasMoreMessages) return;
    await loadMessages(activeConversationId, 'older');
  };

  const toggleMic = () => {
    setCallState((current) => {
      if (!current?.localStream) return current;
      const nextMuted = !current.micMuted;
      current.localStream.getAudioTracks().forEach((track) => { track.enabled = !nextMuted; });
      return { ...current, micMuted: nextMuted };
    });
  };

  const toggleCamera = () => {
    setCallState((current) => {
      if (!current?.localStream) return current;
      const nextCameraOff = !current.cameraOff;
      current.localStream.getVideoTracks().forEach((track) => { track.enabled = !nextCameraOff; });
      return { ...current, cameraOff: nextCameraOff };
    });
  };

  const sectionProps = {
    locale,
    currentUser: user,
    conversations,
    directConversations,
    groupedConversations,
    statuses,
    activeConversation,
    activeConversationId,
    messages,
    callHistory,
    stats,
    refreshing,
    coreError,
    users,
    search,
    setSearch,
    filterTab,
    setFilterTab,
    onlineUserIds,
    typingMap,
    openConversation,
    openNewModal: (preset = 'direct', code = '') => { setJoinCode(code); setModalPreset(preset); setModalOpen(true); },
    startCall,
    requestNotifications,
    setShowProfile,
    navigate,
    routeConversationId,
  };

  let pageContent = null;
  if (section === 'chats') {
    pageContent = (
      <ChatsWorkspacePage
        {...sectionProps}
        onOpenConversation={openConversation}
        onBackToList={returnToChatList}
        onBlock={blockCurrent}
        onSend={sendMessage}
        onPreferenceChange={updateConversationPreference}
        onTyping={(isTyping) => socketRef.current?.emit(isTyping ? 'typing:start' : 'typing:stop', { conversationId: activeConversationId })}
        onLoadOlder={loadOlder}
        hasMore={hasMoreMessages}
        onEditMessage={editMessage}
        onDeleteMessage={deleteMessage}
        onToggleStar={toggleStar}
        onForwardMessage={forwardMessage}
        onRefreshConversation={refreshConversation}
        onManageConversation={manageConversation}
        socketStatus={socketStatus}
      />
    );
  } else if (section === 'calls') {
    pageContent = <CallsWorkspacePage {...sectionProps} />;
  } else if (section === 'groups') {
    pageContent = <GroupsWorkspacePage {...sectionProps} />;
  } else if (section === 'discover') {
    pageContent = <DiscoverWorkspacePage {...sectionProps} onRefresh={refreshCore} coreError={coreError} />;
  } else if (section === 'settings') {
    pageContent = <SettingsWorkspacePage {...sectionProps} blockedUsers={blockedUsers} onOpenProfile={() => setShowProfile(true)} onChangeTheme={applyTheme} themeBusy={false} />;
  } else {
    pageContent = <HomeDashboardPage {...sectionProps} />;
  }

  return (
    <>
      <WorkspaceShell
        locale={locale}
        currentUser={user}
        section={section}
        navigate={navigate}
        logout={logout}
        unreadCount={stats.unread}
        socketStatus={socketStatus}
        chatFocus={isConversationRoute}
      >
        {pageContent}
      </WorkspaceShell>

      <NewConversationModal open={modalOpen} preset={modalPreset} joinCode={joinCode} onClose={() => setModalOpen(false)} onCreated={handleConversationCreated} users={users} locale={locale} />
      <ProfilePanel open={showProfile} onClose={() => setShowProfile(false)} user={user} locale={locale} updateUser={updateUser} blockedUsers={blockedUsers} onBlockedChange={refreshBlockedUsers} />
      <CallOverlay locale={locale} callState={callState} onAccept={acceptIncomingCall} onEnd={() => endCall(true)} onReject={rejectCall} onToggleMic={toggleMic} onToggleCamera={toggleCamera} />
      {toast && <div className="toast">{toast}</div>}
    </>
  );
}
