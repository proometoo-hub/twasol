import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  AppState,
  BackHandler,
  FlatList,
  KeyboardAvoidingView,
  Modal,
  PermissionsAndroid,
  Platform,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { StatusBar as ExpoStatusBar } from 'expo-status-bar';
import { WebView } from 'react-native-webview';
import * as DocumentPicker from 'expo-document-picker';
import * as ImagePicker from 'expo-image-picker';
import { io } from 'socket.io-client';
import { createApiClient } from './src/api';
import { DEFAULT_API_URL, DEFAULT_WEB_URL, deriveApiUrlFromWeb, deriveWebUrlFromApi, normalizeUrl } from './src/config';
import { bubbleTime, conversationSubtitle, conversationTitle, formatTime, initials } from './src/helpers';
import { clearSession, KEYS, loadSession, saveSession } from './src/storage';
import { describeCallState, requestCallPermissions } from './src/nativeCall';
import { createNativeCallEngine, getNativeWebRTCSupport, getRTCViewComponent } from './src/webrtcNative';
import { clearCallSession, loadCallSession, saveCallSession } from './src/callSession';
import {
  CALL_ACTION_ACCEPT,
  CALL_ACTION_DECLINE,
  configureCallNotifications,
  dismissNotificationById,
  Notifications,
  registerForPushNotificationsAsync,
} from './src/notifications';

function Avatar({ name, size = 44 }) {
  return (
    <View style={[styles.avatar, { width: size, height: size, borderRadius: size / 2 }]}>
      <Text style={[styles.avatarText, { fontSize: Math.max(14, size * 0.32) }]}>{initials(name)}</Text>
    </View>
  );
}

function HeaderButton({ label, onPress, danger }) {
  return (
    <TouchableOpacity onPress={onPress} style={[styles.headerButton, danger && styles.headerButtonDanger]}>
      <Text style={[styles.headerButtonText, danger && styles.headerButtonTextDanger]}>{label}</Text>
    </TouchableOpacity>
  );
}

function NavButton({ label, active, onPress }) {
  return (
    <TouchableOpacity style={[styles.navButton, active && styles.navButtonActive]} onPress={onPress}>
      <Text style={[styles.navButtonText, active && styles.navButtonTextActive]}>{label}</Text>
    </TouchableOpacity>
  );
}

function EmptyState({ title, subtitle }) {
  return (
    <View style={styles.emptyState}>
      <Text style={styles.emptyTitle}>{title}</Text>
      {!!subtitle && <Text style={styles.emptySubtitle}>{subtitle}</Text>}
    </View>
  );
}

export default function App() {
  const [apiUrl, setApiUrl] = useState(normalizeUrl(DEFAULT_API_URL));
  const [webUrl, setWebUrl] = useState(normalizeUrl(DEFAULT_WEB_URL));
  const [token, setToken] = useState('');
  const [user, setUser] = useState(null);
  const [booting, setBooting] = useState(true);
  const [authMode, setAuthMode] = useState('login');
  const [authForm, setAuthForm] = useState({ name: '', email: '', password: '' });
  const [authBusy, setAuthBusy] = useState(false);
  const [authError, setAuthError] = useState('');
  const [mobileTab, setMobileTab] = useState('rooms');

  const [rooms, setRooms] = useState([]);
  const [counts, setCounts] = useState({});
  const [roomsBusy, setRoomsBusy] = useState(false);
  const [selectedRoom, setSelectedRoom] = useState(null);
  const [messages, setMessages] = useState([]);
  const [messagesBusy, setMessagesBusy] = useState(false);
  const [composer, setComposer] = useState('');
  const [uploadBusy, setUploadBusy] = useState(false);

  const [settingsVisible, setSettingsVisible] = useState(false);
  const [advancedVisible, setAdvancedVisible] = useState(false);
  const [webLoading, setWebLoading] = useState(false);
  const [webCanGoBack, setWebCanGoBack] = useState(false);
  const [serverDraft, setServerDraft] = useState(normalizeUrl(DEFAULT_API_URL));
  const [serverBusy, setServerBusy] = useState(false);
  const [serverStatus, setServerStatus] = useState(null);
  const [serverError, setServerError] = useState('');

  const [searchQuery, setSearchQuery] = useState('');
  const [searchBusy, setSearchBusy] = useState(false);
  const [searchResults, setSearchResults] = useState([]);
  const [createVisible, setCreateVisible] = useState(false);
  const [createBusy, setCreateBusy] = useState(false);
  const [createError, setCreateError] = useState('');
  const [createForm, setCreateForm] = useState({ name: '', description: '', isGroup: true, isChannel: false, requireApproval: false, welcomeMsg: '', topic: '', tags: '' });
  const [profileBusy, setProfileBusy] = useState(false);
  const [profileError, setProfileError] = useState('');
  const [profileSaved, setProfileSaved] = useState('');
  const [profileForm, setProfileForm] = useState({ name: '', bio: '', phone: '' });

  const [callVisible, setCallVisible] = useState(false);
  const [callMode, setCallMode] = useState('audio');
  const [callStage, setCallStage] = useState('idle');
  const [callNotice, setCallNotice] = useState('');
  const [callError, setCallError] = useState('');
  const [callDevices, setCallDevices] = useState({ camera: false, microphone: false });
  const [callControls, setCallControls] = useState({ micEnabled: false, camEnabled: false, speakerOn: true });
  const [callChat, setCallChat] = useState([]);
  const [callComposer, setCallComposer] = useState('');
  const [incomingCall, setIncomingCall] = useState(null);
  const [pushToken, setPushToken] = useState('');
  const [pendingCallSession, setPendingCallSession] = useState(null);
  const [pendingNotificationAction, setPendingNotificationAction] = useState(null);
  const [appState, setAppState] = useState(AppState.currentState || 'active');

  const [localPreviewUrl, setLocalPreviewUrl] = useState('');
  const [remotePreviewUrl, setRemotePreviewUrl] = useState('');
  const [nativeCallReady, setNativeCallReady] = useState(false);
  const [nativeCallSupport, setNativeCallSupport] = useState(getNativeWebRTCSupport());
  const [callPeerId, setCallPeerId] = useState(null);
  const [callRemoteReady, setCallRemoteReady] = useState(false);
  const [callSignalState, setCallSignalState] = useState('idle');
  const [callIsGroup, setCallIsGroup] = useState(false);
  const [callParticipants, setCallParticipants] = useState([]);
  const [callRoles, setCallRoles] = useState({});
  const [callPending, setCallPending] = useState([]);
  const [callRaiseHands, setCallRaiseHands] = useState({});
  const [callReactions, setCallReactions] = useState([]);
  const [callMuteAll, setCallMuteAll] = useState(false);
  const [callWaitingRoom, setCallWaitingRoom] = useState(false);
  const [callRecording, setCallRecording] = useState(false);
  const [callPinnedUserId, setCallPinnedUserId] = useState(null);
  const [callLayoutMode, setCallLayoutMode] = useState('spotlight');
  const [callParticipantStates, setCallParticipantStates] = useState({});
  const [callScreenSharers, setCallScreenSharers] = useState({});
  const [callActiveSpeakerId, setCallActiveSpeakerId] = useState(null);
  const [callAutoPinEnabled, setCallAutoPinEnabled] = useState(true);
  const [callHostTarget, setCallHostTarget] = useState(null);

  const callEngineRef = useRef(null);

  const socketRef = useRef(null);
  const webRef = useRef(null);
  const messagesRef = useRef(null);
  const callMessagesRef = useRef(null);
  const searchTimerRef = useRef(null);
  const roomsRef = useRef([]);
  const selectedRoomRef = useRef(null);
  const callPeerIdRef = useRef(null);
  const callVisibleRef = useRef(false);
  const callIsGroupRef = useRef(false);
  const callModeRef = useRef('audio');
  const incomingCallRef = useRef(null);
  const callControlsRef = useRef({ micEnabled: false, camEnabled: false, speakerOn: true });
  const appStateRef = useRef(AppState.currentState || 'active');
  const pendingIncomingIceRef = useRef([]);
  const pendingOutgoingIceRef = useRef([]);
  const callNotificationIdRef = useRef(null);

  const api = useMemo(() => createApiClient(() => apiUrl, () => token), [apiUrl, token]);
  const RTCView = useMemo(() => getRTCViewComponent(), []);

  useEffect(() => { roomsRef.current = rooms; }, [rooms]);
  useEffect(() => { selectedRoomRef.current = selectedRoom; }, [selectedRoom]);
  useEffect(() => { callPeerIdRef.current = callPeerId; }, [callPeerId]);
  useEffect(() => { callVisibleRef.current = callVisible; }, [callVisible]);
  useEffect(() => { callIsGroupRef.current = callIsGroup; }, [callIsGroup]);
  useEffect(() => { callModeRef.current = callMode; }, [callMode]);
  useEffect(() => { incomingCallRef.current = incomingCall; }, [incomingCall]);
  useEffect(() => { callControlsRef.current = callControls; }, [callControls]);

  const sortRooms = useCallback((items, unreadMap) => [...(items || [])].sort((a, b) => {
    const ua = unreadMap?.[a.id] || 0;
    const ub = unreadMap?.[b.id] || 0;
    if (ua !== ub) return ub - ua;
    return new Date(b.updatedAt || 0) - new Date(a.updatedAt || 0);
  }), []);

  const mergeCallParticipants = useCallback((incoming = []) => {
    setCallParticipants((prev) => {
      const map = new Map((prev || []).map((item) => [String(item.userId), item]));
      (incoming || []).forEach((item) => {
        if (!item?.userId) return;
        const key = String(item.userId);
        map.set(key, { ...(map.get(key) || {}), ...item });
      });
      return Array.from(map.values());
    });
  }, []);

  const removeCallParticipant = useCallback((targetUserId) => {
    setCallParticipants((prev) => prev.filter((item) => item.userId !== targetUserId));
    setCallParticipantStates((prev) => {
      const next = { ...prev };
      delete next[targetUserId];
      return next;
    });
    setCallRaiseHands((prev) => {
      const next = { ...prev };
      delete next[targetUserId];
      return next;
    });
    setCallScreenSharers((prev) => {
      const next = { ...prev };
      delete next[targetUserId];
      return next;
    });
    setCallPinnedUserId((prev) => (prev === targetUserId ? null : prev));
  }, []);

  const cycleCallLayout = useCallback(() => {
    setCallLayoutMode((prev) => prev === 'spotlight' ? 'grid' : prev === 'grid' ? 'compact' : 'spotlight');
  }, []);

  const markActiveSpeaker = useCallback((userId, reason = '') => {
    if (!userId) return;
    setCallActiveSpeakerId(userId);
    setCallParticipantStates((prev) => ({ ...prev, [userId]: reason || prev[userId] || 'live' }));
    if (callAutoPinEnabled && !callScreenSharers?.[userId]) {
      setCallPinnedUserId((prev) => prev || userId);
    }
  }, [callAutoPinEnabled, callScreenSharers]);

  const isCallHost = useCallback((targetUserId = user?.id) => {
    const role = callRoles?.[targetUserId];
    return role === 'host' || role === 'presenter' || role === 'admin';
  }, [callRoles, user?.id]);

  const resolveRoomById = useCallback(async (conversationId) => {
    if (!conversationId) return null;
    const local = roomsRef.current.find((item) => item.id === conversationId);
    if (local) {
      try {
        return await api.roomInfo(conversationId);
      } catch {
        return local;
      }
    }
    try {
      const room = await api.roomInfo(conversationId);
      setRooms((prev) => sortRooms([room, ...prev.filter((item) => item.id !== room.id)], counts));
      return room;
    } catch {
      return null;
    }
  }, [api, counts, sortRooms]);

  const flushPendingIncomingIce = useCallback(async () => {
    if (!callEngineRef.current || !pendingIncomingIceRef.current.length) return;
    const queue = [...pendingIncomingIceRef.current];
    pendingIncomingIceRef.current = [];
    for (const candidate of queue) {
      try { await callEngineRef.current?.addIceCandidate?.(candidate); } catch {}
    }
  }, []);

  const emitIceCandidate = useCallback((candidate) => {
    const conversationId = selectedRoomRef.current?.id;
    const targetUserId = callPeerIdRef.current;
    if (!candidate) return;
    if (!conversationId || !targetUserId) {
      pendingOutgoingIceRef.current.push(candidate);
      return;
    }
    socketRef.current?.emit(callIsGroupRef.current ? 'group_call_ice' : 'native_call_ice', { conversationId, targetUserId, candidate });
  }, []);

  const flushPendingOutgoingIce = useCallback(() => {
    const conversationId = selectedRoomRef.current?.id;
    const targetUserId = callPeerIdRef.current;
    if (!conversationId || !targetUserId || !pendingOutgoingIceRef.current.length) return;
    const eventName = callIsGroupRef.current ? 'group_call_ice' : 'native_call_ice';
    const queue = [...pendingOutgoingIceRef.current];
    pendingOutgoingIceRef.current = [];
    queue.forEach((candidate) => socketRef.current?.emit(eventName, { conversationId, targetUserId, candidate }));
  }, []);

  const boot = useCallback(async () => {
    try {
      const values = await AsyncStorage.multiGet([KEYS.apiUrl, KEYS.webUrl]);
      const map = Object.fromEntries(values);
      const storedApi = normalizeUrl(map[KEYS.apiUrl] || DEFAULT_API_URL);
      const storedWeb = normalizeUrl(map[KEYS.webUrl] || deriveWebUrlFromApi(storedApi) || DEFAULT_WEB_URL);
      const session = await loadSession();
      setApiUrl(storedApi);
      setWebUrl(storedWeb);
      setServerDraft(storedApi);
      if (session.token && session.user) {
        setToken(session.token);
        setUser(session.user);
        setProfileForm({ name: session.user?.name || '', bio: session.user?.bio || '', phone: session.user?.phone || '' });
      }
      const savedCall = await loadCallSession();
      if (savedCall) setPendingCallSession(savedCall);
    } finally {
      setBooting(false);
    }
  }, []);

  useEffect(() => { boot(); }, [boot]);

  useEffect(() => {
    configureCallNotifications();
    const responseSub = Notifications.addNotificationResponseReceivedListener((response) => {
      const data = response?.notification?.request?.content?.data || {};
      setPendingNotificationAction({ actionIdentifier: response?.actionIdentifier, data });
    });
    Notifications.getLastNotificationResponseAsync().then((response) => {
      if (!response) return;
      const data = response?.notification?.request?.content?.data || {};
      setPendingNotificationAction({ actionIdentifier: response?.actionIdentifier, data });
    }).catch(() => {});
    return () => responseSub.remove();
  }, []);

  useEffect(() => {
    if (!token) return undefined;
    let cancelled = false;
    (async () => {
      const registration = await registerForPushNotificationsAsync();
      if (cancelled || !registration?.token) return;
      setPushToken(registration.token);
      try {
        await api.registerPushToken({
          expoPushToken: registration.token,
          platform: Platform.OS,
          deviceName: Platform.constants?.Model || 'android',
          appVersion: '6.45.0',
        });
      } catch {}
    })();
    return () => { cancelled = true; };
  }, [api, token]);

  useEffect(() => {
    const sub = AppState.addEventListener('change', (nextState) => {
      const prev = appStateRef.current;
      appStateRef.current = nextState;
      setAppState(nextState);
      if ((prev === 'background' || prev === 'inactive') && nextState === 'active' && callVisibleRef.current && selectedRoomRef.current?.id) {
        setCallNotice((prevNotice) => prevNotice ? `${prevNotice} · تمت استعادة الجلسة بعد الرجوع من الخلفية.` : 'تمت استعادة الجلسة بعد الرجوع من الخلفية.');
        if (callIsGroupRef.current) {
          socketRef.current?.emit('join_group_call', { conversationId: selectedRoomRef.current.id, callType: callModeRef.current === 'video' ? 'video' : 'audio' });
        } else if (callPeerIdRef.current) {
          socketRef.current?.emit('native_call_state', { conversationId: selectedRoomRef.current.id, targetUserId: callPeerIdRef.current, state: { resumed: true, ...callControlsRef.current } });
        }
        flushPendingOutgoingIce();
        flushPendingIncomingIce();
      }
    });
    return () => sub.remove();
  }, [flushPendingIncomingIce, flushPendingOutgoingIce]);

  useEffect(() => {
    if (!token || !pendingCallSession?.conversationId) return;
    let active = true;
    (async () => {
      const room = await resolveRoomById(pendingCallSession.conversationId);
      if (!active || !room) return;
      setSelectedRoom(room);
      if (pendingCallSession?.incomingCall) setIncomingCall(pendingCallSession.incomingCall);
      if (pendingCallSession?.callVisible) {
        setCallVisible(true);
        setCallIsGroup(!!pendingCallSession.callIsGroup);
        setCallMode(pendingCallSession.callMode || 'audio');
        setCallStage(pendingCallSession.callStage || 'connecting');
        setCallPeerId(pendingCallSession.callPeerId || null);
        setCallNotice('تمت استعادة شاشة المكالمة السابقة. إن لزم، استخدم إعادة تهيئة الأجهزة لإكمال الربط.');
      }
      setPendingCallSession(null);
    })();
    return () => { active = false; };
  }, [pendingCallSession, resolveRoomById, token]);

  useEffect(() => {
    if (!callVisible && !incomingCall) {
      clearCallSession();
      return;
    }
    saveCallSession({
      conversationId: selectedRoom?.id || incomingCall?.conversationId || null,
      callVisible,
      callIsGroup,
      callMode,
      callStage,
      callPeerId,
      incomingCall,
    });
  }, [callIsGroup, callMode, callPeerId, callStage, callVisible, incomingCall, selectedRoom?.id]);

  const loadRooms = useCallback(async () => {
    if (!token) return;
    setRoomsBusy(true);
    try {
      const [roomList, unreadMap] = await Promise.all([api.rooms(), api.unreadCounts().catch(() => ({}))]);
      setCounts(unreadMap || {});
      setRooms(sortRooms(roomList, unreadMap));
    } catch (err) {
      Alert.alert('تعذر تحميل المحادثات', err instanceof Error ? err.message : 'خطأ غير معروف');
    } finally {
      setRoomsBusy(false);
    }
  }, [api, sortRooms, token]);

  const loadProfile = useCallback(async () => {
    if (!token) return;
    try {
      const me = await api.me();
      setUser(me);
      setProfileForm({ name: me?.name || '', bio: me?.bio || '', phone: me?.phone || '' });
    } catch {}
  }, [api, token]);

  const hydrateIncomingCall = useCallback(async (payload = {}) => {
    const room = await resolveRoomById(payload.conversationId);
    if (room) {
      setSelectedRoom(room);
      loadMessages(room);
    }
    const normalized = {
      ...payload,
      isGroup: !!payload.isGroup || payload.kind === 'incoming_group_call',
      mode: payload.mode || payload.callType || 'audio',
      roomName: payload.roomName || room?.name || conversationTitle(room, user?.id),
      from: payload.from || { id: payload.callerId, name: payload.fromName || 'مستخدم' },
    };
    setIncomingCall(normalized);
    setCallNotice(normalized.isGroup ? 'وصلك طلب انضمام لمكالمة جماعية.' : 'وردك طلب مكالمة جديد.');
    return normalized;
  }, [loadMessages, resolveRoomById, user?.id]);

  const loadMessages = useCallback(async (room) => {
    if (!room?.id) return;
    setMessagesBusy(true);
    try {
      const data = await api.messages(room.id);
      setMessages(data || []);
      requestAnimationFrame(() => messagesRef.current?.scrollToEnd?.({ animated: false }));
    } catch (err) {
      Alert.alert('تعذر تحميل الرسائل', err instanceof Error ? err.message : 'خطأ غير معروف');
    } finally {
      setMessagesBusy(false);
    }
  }, [api]);

  useEffect(() => {
    if (token) {
      loadRooms();
      loadProfile();
    }
  }, [token, loadProfile, loadRooms]);

  useEffect(() => {
    if (!token) return undefined;
    const socket = io(apiUrl, {
      transports: ['websocket'],
      auth: { token },
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
      timeout: 20000,
    });
    socketRef.current = socket;

    socket.on('connect', () => {
      if (callVisibleRef.current && selectedRoomRef.current?.id) {
        if (callIsGroupRef.current) {
          socket.emit('join_group_call', { conversationId: selectedRoomRef.current.id, callType: callModeRef.current === 'video' ? 'video' : 'audio' });
        } else if (callPeerIdRef.current) {
          socket.emit('native_call_state', { conversationId: selectedRoomRef.current.id, targetUserId: callPeerIdRef.current, state: { resumed: true, ...callControlsRef.current } });
        }
        flushPendingOutgoingIce();
      }
    });

    socket.on('disconnect', () => {
      if (callVisibleRef.current) {
        setCallNotice('انخفض الاتصال بالخادم مؤقتًا. سنحاول استكمال المكالمة تلقائيًا عند عودة الشبكة.');
      }
    });

    socket.on('new_message', (message) => {
      setRooms((prev) => {
        const next = prev.some((room) => room.id === message.conversationId)
          ? prev.map((room) => room.id === message.conversationId ? { ...room, updatedAt: new Date().toISOString(), messages: [message] } : room)
          : prev;
        return sortRooms(next, counts);
      });
      if (selectedRoomRef.current?.id === message.conversationId) {
        setMessages((prev) => [...prev, message]);
        requestAnimationFrame(() => messagesRef.current?.scrollToEnd?.({ animated: true }));
      } else if (message.senderId !== user?.id) {
        setCounts((prev) => ({ ...prev, [message.conversationId]: (prev[message.conversationId] || 0) + 1 }));
      }
    });

    socket.on('native_call_invite', (payload) => {
      hydrateIncomingCall({ ...payload, isGroup: false, mode: payload?.mode || 'audio', kind: 'incoming_call' });
    });

    socket.on('incoming_group_call', (payload) => {
      hydrateIncomingCall({ ...payload, isGroup: true, mode: payload?.callType || 'audio', kind: 'incoming_group_call' });
    });

    socket.on('native_call_accept', async (payload) => {
      if (!payload?.conversationId || payload.conversationId !== selectedRoomRef.current?.id) return;
      setCallPeerId(payload.userId);
      setCallSignalState('accepted');
      setCallNotice('تم قبول المكالمة. جاري إرسال العرض…');
      try {
        if (!callEngineRef.current) {
          await initNativeCallMedia(payload.mode || callModeRef.current || 'audio');
        }
        const offer = await callEngineRef.current?.createOffer?.();
        if (offer) {
          socket.emit('native_call_offer', { conversationId: payload.conversationId, targetUserId: payload.userId, offer });
          setCallSignalState('offer-sent');
          setCallStage('connecting');
          flushPendingOutgoingIce();
        }
      } catch (err) {
        setCallError(err instanceof Error ? err.message : 'تعذر إنشاء عرض المكالمة.');
      }
    });

    socket.on('native_call_decline', (payload) => {
      if (payload?.conversationId !== selectedRoomRef.current?.id) return;
      setIncomingCall(null);
      setCallStage('ended');
      setCallSignalState('declined');
      setCallNotice('رفض الطرف الآخر المكالمة. يمكنك متابعة الدردشة النصية.');
    });

    socket.on('native_call_offer', async (payload) => {
      if (!payload?.conversationId || payload.conversationId !== selectedRoomRef.current?.id) return;
      setCallPeerId(payload.userId);
      try {
        if (!callEngineRef.current) {
          await initNativeCallMedia(callModeRef.current || payload.mode || 'audio');
        }
        await callEngineRef.current?.setRemoteOffer?.(payload.offer);
        const answer = await callEngineRef.current?.createAnswer?.();
        if (answer) {
          socket.emit('native_call_answer', { conversationId: payload.conversationId, targetUserId: payload.userId, answer });
          setCallSignalState('answer-sent');
          setCallStage('connecting');
          setCallNotice('تم إرسال جواب المكالمة. جاري إكمال الربط…');
          flushPendingOutgoingIce();
        }
      } catch (err) {
        setCallError(err instanceof Error ? err.message : 'تعذر معالجة عرض المكالمة.');
      }
    });

    socket.on('native_call_answer', async (payload) => {
      if (!payload?.conversationId || payload.conversationId !== selectedRoomRef.current?.id) return;
      try {
        await callEngineRef.current?.setRemoteAnswer?.(payload.answer);
        await flushPendingIncomingIce();
        setCallSignalState('answer-applied');
        setCallStage('active');
        setCallNotice('تم ربط المكالمة.');
      } catch (err) {
        setCallError(err instanceof Error ? err.message : 'تعذر اعتماد جواب المكالمة.');
      }
    });

    socket.on('native_call_ice', async (payload) => {
      if (!payload?.conversationId || payload.conversationId !== selectedRoomRef.current?.id) return;
      if (!callEngineRef.current) {
        pendingIncomingIceRef.current.push(payload.candidate);
        return;
      }
      try {
        await callEngineRef.current?.addIceCandidate?.(payload.candidate);
      } catch {
        pendingIncomingIceRef.current.push(payload.candidate);
      }
    });

    socket.on('native_call_state', (payload) => {
      if (!payload?.conversationId || payload.conversationId !== selectedRoomRef.current?.id) return;
      const state = payload?.state || {};
      if (state?.resumed) {
        setCallNotice('استعاد الطرف الآخر المكالمة بعد الرجوع من الخلفية.');
        return;
      }
      if (typeof state.micEnabled === 'boolean' || typeof state.camEnabled === 'boolean') {
        setCallNotice(`حالة الطرف الآخر: ${state.micEnabled ? '🎤' : '🔇'} ${state.camEnabled ? '📷' : '🚫📷'}`);
      }
    });

    socket.on('native_call_chat', (payload) => {
      if (!payload?.message || payload.conversationId !== selectedRoomRef.current?.id) return;
      setCallChat((prev) => [...prev, { ...payload.message, mine: false }]);
      requestAnimationFrame(() => callMessagesRef.current?.scrollToEnd?.({ animated: true }));
    });

    socket.on('native_call_end', (payload) => {
      if (payload?.conversationId && payload.conversationId !== selectedRoomRef.current?.id) return;
      setIncomingCall(null);
      setCallStage('ended');
      setCallSignalState('ended');
      setCallNotice('أنهى الطرف الآخر المكالمة.');
    });

    socket.on('group_call_presence', (payload) => {
      if (payload?.conversationId !== selectedRoomRef.current?.id) return;
      mergeCallParticipants(payload.participants || []);
      setCallParticipantStates((prev) => {
        const next = { ...prev };
        (payload.participants || []).forEach((p) => { if (p?.userId) next[p.userId] = next[p.userId] || 'live'; });
        return next;
      });
    });

    socket.on('group_call_participant_joined', (payload) => {
      if (payload?.conversationId !== selectedRoomRef.current?.id) return;
      const participant = payload?.participant || payload || {};
      const participantId = participant?.userId || payload?.userId;
      mergeCallParticipants([{ userId: participantId, name: participant?.name || payload?.name || `عضو ${participantId}`, joinedAt: participant?.joinedAt || payload?.joinedAt }]);
      setCallParticipantStates((prev) => ({ ...prev, [participantId]: 'joining' }));
      setCallNotice(`انضم ${participant?.name || payload?.name || 'عضو جديد'} إلى الغرفة.`);
    });

    socket.on('group_call_participant_left', (payload) => {
      if (payload?.conversationId !== selectedRoomRef.current?.id) return;
      removeCallParticipant(payload.userId);
    });

    socket.on('group_call_state', (payload) => {
      if (payload?.conversationId !== selectedRoomRef.current?.id) return;
      if (payload.roles) setCallRoles(payload.roles);
      if (Array.isArray(payload.pending)) setCallPending(payload.pending);
      setCallWaitingRoom(!!payload.waitingRoom);
      setCallMuteAll(!!payload.muteAll);
      if (payload.activeSpeakerId) markActiveSpeaker(payload.activeSpeakerId, 'يتحدث الآن');
    });

    socket.on('group_call_pending_joiners', (payload) => {
      if (payload?.conversationId !== selectedRoomRef.current?.id) return;
      setCallPending(Array.isArray(payload.pending) ? payload.pending : []);
    });

    socket.on('group_call_waiting_room', (payload) => {
      if (payload?.conversationId !== selectedRoomRef.current?.id) return;
      if (payload.status === 'pending') setCallNotice('تم إدخالك إلى غرفة الانتظار. بانتظار موافقة المشرف.');
      if (payload.status === 'admitted') setCallNotice('تم قبولك في المكالمة الجماعية.');
      if (payload.status === 'rejected') setCallError('تم رفض طلب انضمامك إلى المكالمة الجماعية.');
    });

    socket.on('group_call_raise_hand', (payload) => {
      if (payload?.conversationId !== selectedRoomRef.current?.id) return;
      setCallRaiseHands((prev) => ({ ...prev, [payload.userId]: !!payload.raised }));
      if (payload.raised) markActiveSpeaker(payload.userId, 'رفع يده');
    });

    socket.on('group_call_reaction', (payload) => {
      if (payload?.conversationId !== selectedRoomRef.current?.id) return;
      const item = { id: `${payload.userId}_${Date.now()}`, userId: payload.userId, reaction: payload.reaction || '👍' };
      setCallReactions((prev) => [...prev.slice(-5), item]);
      markActiveSpeaker(payload.userId, 'نشاط حديث');
      setTimeout(() => setCallReactions((prev) => prev.filter((r) => r.id !== item.id)), 2200);
    });

    socket.on('group_call_active_speaker', (payload) => {
      if (payload?.conversationId !== selectedRoomRef.current?.id) return;
      markActiveSpeaker(payload.userId, 'يتحدث الآن');
    });

    socket.on('group_call_recording', (payload) => {
      if (payload?.conversationId !== selectedRoomRef.current?.id) return;
      setCallRecording(!!payload.enabled);
    });

    socket.on('group_call_mute_all', (payload) => {
      if (payload?.conversationId !== selectedRoomRef.current?.id) return;
      setCallMuteAll(!!payload.enabled);
      setCallNotice(payload.enabled ? 'قام المشرف بكتم الجميع مؤقتًا.' : 'ألغى المشرف كتم الجميع.');
    });

    socket.on('group_call_screen_share', (payload) => {
      if (payload?.conversationId !== selectedRoomRef.current?.id) return;
      setCallScreenSharers((prev) => ({ ...prev, [payload.userId]: !!payload.enabled }));
      if (payload.enabled) setCallPinnedUserId(payload.userId);
    });

    socket.on('group_call_role_updated', (payload) => {
      if (payload?.conversationId !== selectedRoomRef.current?.id) return;
      setCallRoles((prev) => ({ ...prev, [user?.id]: payload.role }));
      setCallNotice(`تم تحديث دورك داخل المكالمة إلى ${payload.role}.`);
    });

    socket.on('group_call_admin_action', (payload) => {
      if (payload?.conversationId !== selectedRoomRef.current?.id) return;
      if (payload?.targetUserId === user?.id) {
        setCallNotice(payload.action === 'remove' ? 'تمت إزالتك من المكالمة بواسطة المضيف.' : 'تم تنفيذ إجراء إداري على مشاركتك.');
      }
    });

    socket.on('group_call_force_leave', (payload) => {
      if (payload?.conversationId !== selectedRoomRef.current?.id) return;
      setCallError('تم إنهاء انضمامك إلى المكالمة الجماعية بواسطة المضيف.');
      closeCall();
    });

    socket.on('group_call_offer', async (payload) => {
      if (payload?.conversationId !== selectedRoomRef.current?.id || payload?.callerId === user?.id) return;
      try {
        if (!callEngineRef.current) await initNativeCallMedia(payload.callType === 'video' ? 'video' : 'audio');
        setCallPeerId(payload.callerId || null);
        setCallParticipantStates((prev) => ({ ...prev, [payload.callerId]: 'connecting' }));
        await callEngineRef.current?.setRemoteOffer?.(payload.signal);
        const answer = await callEngineRef.current?.createAnswer?.();
        if (answer) {
          socket.emit('group_call_answer', { conversationId: payload.conversationId, targetUserId: payload.callerId, signal: answer });
          flushPendingOutgoingIce();
        }
      } catch (err) {
        setCallError(err instanceof Error ? err.message : 'تعذر قبول بث جماعي وارد.');
      }
    });

    socket.on('group_call_answer', async (payload) => {
      if (payload?.conversationId !== selectedRoomRef.current?.id || payload?.userId === user?.id) return;
      try {
        await callEngineRef.current?.setRemoteAnswer?.(payload.signal);
        await flushPendingIncomingIce();
        setCallParticipantStates((prev) => ({ ...prev, [payload.userId]: 'live' }));
      } catch {}
    });

    socket.on('group_call_ice', async (payload) => {
      if (payload?.conversationId !== selectedRoomRef.current?.id || payload?.userId === user?.id) return;
      if (!callEngineRef.current) {
        pendingIncomingIceRef.current.push(payload.candidate);
        return;
      }
      try {
        await callEngineRef.current?.addIceCandidate?.(payload.candidate);
      } catch {
        pendingIncomingIceRef.current.push(payload.candidate);
      }
    });

    return () => {
      socket.disconnect();
      socketRef.current = null;
    };
  }, [apiUrl, closeCall, counts, flushPendingIncomingIce, flushPendingOutgoingIce, hydrateIncomingCall, initNativeCallMedia, loadMessages, loadProfile, loadRooms, markActiveSpeaker, mergeCallParticipants, removeCallParticipant, sortRooms, token, user?.id]);

  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (callVisible) {
        closeCall();
        return true;
      }
      if (advancedVisible) {
        if (webCanGoBack) {
          webRef.current?.goBack?.();
        } else {
          setAdvancedVisible(false);
        }
        return true;
      }
      if (selectedRoom) {
        setSelectedRoom(null);
        setMobileTab('rooms');
        return true;
      }
      return false;
    });
    return () => sub.remove();
  }, [advancedVisible, callVisible, selectedRoom, webCanGoBack]);

  useEffect(() => {
    if (!token || !searchQuery.trim()) {
      setSearchResults([]);
      setSearchBusy(false);
      return;
    }
    clearTimeout(searchTimerRef.current);
    searchTimerRef.current = setTimeout(async () => {
      setSearchBusy(true);
      try {
        const data = await api.searchUsers(searchQuery.trim());
        setSearchResults(data || []);
      } catch {
        setSearchResults([]);
      } finally {
        setSearchBusy(false);
      }
    }, 350);
    return () => clearTimeout(searchTimerRef.current);
  }, [api, searchQuery, token]);

  const loginOrRegister = useCallback(async () => {
    setAuthBusy(true);
    setAuthError('');
    try {
      const payload = authMode === 'login'
        ? await api.login(authForm.email.trim(), authForm.password)
        : await api.register(authForm.name.trim(), authForm.email.trim(), authForm.password);
      setToken(payload.token);
      setUser(payload.user);
      await saveSession({ token: payload.token, user: payload.user });
      setProfileForm({ name: payload.user?.name || '', bio: payload.user?.bio || '', phone: payload.user?.phone || '' });
    } catch (err) {
      setAuthError(err instanceof Error ? err.message : 'تعذر تسجيل الدخول');
    } finally {
      setAuthBusy(false);
    }
  }, [api, authForm, authMode]);

  const logout = useCallback(async () => {
    try {
      if (pushToken) await api.unregisterPushToken(pushToken);
    } catch {}
    try { await api.logout(); } catch {}
    await clearSession();
    await clearCallSession();
    setPushToken('');
    setToken('');
    setUser(null);
    setRooms([]);
    setSelectedRoom(null);
    setMessages([]);
    setMobileTab('rooms');
  }, [api, pushToken]);

  const verifyServer = useCallback(async (candidate) => {
    const normalized = normalizeUrl(candidate);
    if (!normalized) {
      setServerError('أدخل عنوانًا صحيحًا.');
      return false;
    }
    setServerBusy(true);
    setServerError('');
    const client = createApiClient(() => normalized, () => token);
    try {
      const data = await client.health();
      setServerStatus(data);
      return true;
    } catch (err) {
      setServerStatus(null);
      setServerError(err instanceof Error ? err.message : 'تعذر الوصول إلى الخادم');
      return false;
    } finally {
      setServerBusy(false);
    }
  }, [token]);

  const saveServer = useCallback(async () => {
    const normalized = normalizeUrl(serverDraft);
    const ok = await verifyServer(normalized);
    if (!ok) return;
    const nextWeb = deriveWebUrlFromApi(normalized);
    setApiUrl(normalized);
    setWebUrl(nextWeb);
    await AsyncStorage.multiSet([[KEYS.apiUrl, normalized], [KEYS.webUrl, nextWeb]]);
    setSettingsVisible(false);
    if (token) loadRooms();
  }, [loadRooms, serverDraft, token, verifyServer]);

  const openRoom = useCallback(async (room) => {
    if (!room?.id) return;
    let nextRoom = room;
    try {
      nextRoom = await api.roomInfo(room.id);
    } catch {}
    setSelectedRoom(nextRoom);
    setMobileTab('rooms');
    setCounts((prev) => ({ ...prev, [nextRoom.id]: 0 }));
    loadMessages(nextRoom);
  }, [api, loadMessages]);

  const sendMessage = useCallback(() => {
    const text = composer.trim();
    if (!selectedRoom || !text) return;
    socketRef.current?.emit('send_message', { conversationId: selectedRoom.id, text });
    setComposer('');
  }, [composer, selectedRoom]);

  const pickImageAttachment = useCallback(async () => {
    if (!selectedRoom) return;
    try {
      const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!perm.granted) throw new Error('تم رفض إذن الصور');
      const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images', 'videos'], quality: 0.85 });
      if (result.canceled || !result.assets?.length) return;
      const asset = result.assets[0];
      setUploadBusy(true);
      const uploaded = await api.uploadFile({ uri: asset.uri, name: asset.fileName || `media-${Date.now()}`, mimeType: asset.mimeType || (asset.type === 'video' ? 'video/mp4' : 'image/jpeg') });
      socketRef.current?.emit('send_message', { conversationId: selectedRoom.id, type: uploaded.type || (asset.type === 'video' ? 'video' : 'image'), fileUrl: uploaded.fileUrl, fileName: uploaded.fileName, fileSize: uploaded.fileSize, text: '' });
    } catch (err) {
      Alert.alert('تعذر رفع الوسائط', err instanceof Error ? err.message : 'خطأ غير معروف');
    } finally {
      setUploadBusy(false);
    }
  }, [api, selectedRoom]);

  const pickFileAttachment = useCallback(async () => {
    if (!selectedRoom) return;
    try {
      const result = await DocumentPicker.getDocumentAsync({ multiple: false, copyToCacheDirectory: true });
      if (result.canceled || !result.assets?.length) return;
      const asset = result.assets[0];
      setUploadBusy(true);
      const uploaded = await api.uploadFile({ uri: asset.uri, name: asset.name || `file-${Date.now()}`, mimeType: asset.mimeType || 'application/octet-stream' });
      socketRef.current?.emit('send_message', { conversationId: selectedRoom.id, type: uploaded.type || 'file', fileUrl: uploaded.fileUrl, fileName: uploaded.fileName, fileSize: uploaded.fileSize, text: '' });
    } catch (err) {
      Alert.alert('تعذر رفع الملف', err instanceof Error ? err.message : 'خطأ غير معروف');
    } finally {
      setUploadBusy(false);
    }
  }, [api, selectedRoom]);

  const createRoom = useCallback(async () => {
    if (!createForm.name.trim()) {
      setCreateError('اكتب اسم المجموعة أو القناة أولًا.');
      return;
    }
    setCreateBusy(true);
    setCreateError('');
    try {
      await api.createRoom({
        name: createForm.name.trim(),
        description: createForm.description,
        isGroup: createForm.isGroup,
        isChannel: createForm.isChannel,
        requireApproval: createForm.requireApproval,
        welcomeMsg: createForm.welcomeMsg,
        topic: createForm.topic,
        tags: createForm.tags,
      });
      setCreateVisible(false);
      setCreateForm({ name: '', description: '', isGroup: true, isChannel: false, requireApproval: false, welcomeMsg: '', topic: '', tags: '' });
      loadRooms();
    } catch (err) {
      setCreateError(err instanceof Error ? err.message : 'فشل الإنشاء');
    } finally {
      setCreateBusy(false);
    }
  }, [api, createForm, loadRooms]);

  const saveProfile = useCallback(async () => {
    setProfileBusy(true);
    setProfileSaved('');
    setProfileError('');
    try {
      const me = await api.updateProfile(profileForm);
      setUser(me);
      await saveSession({ token, user: me });
      setProfileSaved('تم حفظ التغييرات بنجاح.');
    } catch (err) {
      setProfileError(err instanceof Error ? err.message : 'تعذر حفظ الملف الشخصي');
    } finally {
      setProfileBusy(false);
    }
  }, [api, profileForm, token]);

  const openAdvanced = useCallback(() => {
    setAdvancedVisible(true);
    setWebLoading(true);
  }, []);

  const closeCall = useCallback(() => {
    if (callIsGroup) {
      socketRef.current?.emit('group_call_leave', { conversationId: selectedRoom?.id });
    } else {
      socketRef.current?.emit('native_call_end', { conversationId: selectedRoom?.id, targetUserId: callPeerId || undefined });
    }
    try { callEngineRef.current?.dispose?.(); } catch {}
    callEngineRef.current = null;
    pendingIncomingIceRef.current = [];
    pendingOutgoingIceRef.current = [];
    dismissNotificationById(callNotificationIdRef.current);
    callNotificationIdRef.current = null;
    clearCallSession();
    setIncomingCall(null);
    setLocalPreviewUrl('');
    setRemotePreviewUrl('');
    setNativeCallReady(false);
    setCallPeerId(null);
    setCallRemoteReady(false);
    setCallSignalState('idle');
    setCallIsGroup(false);
    setCallParticipants([]);
    setCallRoles({});
    setCallPending([]);
    setCallRaiseHands({});
    setCallReactions([]);
    setCallMuteAll(false);
    setCallWaitingRoom(false);
    setCallRecording(false);
    setCallPinnedUserId(null);
    setCallLayoutMode('spotlight');
    setCallParticipantStates({});
    setCallScreenSharers({});
    setCallVisible(false);
    setCallStage('idle');
    setCallNotice('');
    setCallError('');
    setCallDevices({ camera: false, microphone: false });
    setCallControls({ micEnabled: false, camEnabled: false, speakerOn: true });
    setCallChat([]);
  }, [callIsGroup, callPeerId, selectedRoom?.id]);

  const applyPermissionsToCall = useCallback(async (mode = 'audio') => {
    const result = await requestCallPermissions(mode, PermissionsAndroid);
    setCallDevices({ camera: !!result.camera, microphone: !!result.microphone });
    setCallControls({ micEnabled: !!result.microphone, camEnabled: mode === 'video' && !!result.camera, speakerOn: true });
    setCallError(result.error || '');
    setCallNotice(describeCallState(mode, result));
    return result;
  }, []);

  const initNativeCallMedia = useCallback(async (mode = 'audio') => {
    try { callEngineRef.current?.dispose?.(); } catch {}
    callEngineRef.current = null;
    pendingIncomingIceRef.current = [];
    setLocalPreviewUrl('');
    setRemotePreviewUrl('');
    setNativeCallReady(false);
    setCallRemoteReady(false);
    setCallSignalState('idle');
    const support = getNativeWebRTCSupport();
    setNativeCallSupport(support);
    if (!support.available) {
      setCallNotice((prev) => prev || 'محرك WebRTC الأصلي غير متاح في هذه البنية، لكن الدردشة داخل المكالمة ما زالت تعمل.');
      if (support.error) {
        setCallError(support.error);
      }
      return null;
    }
    const engine = await createNativeCallEngine({
      mode,
      onRemoteStream: (stream) => {
        try {
          const url = typeof stream?.toURL === 'function' ? stream.toURL() : '';
          if (url) {
            setRemotePreviewUrl(url);
            setCallRemoteReady(true);
          }
        } catch {}
      },
      onIceCandidate: emitIceCandidate,
      onConnectionStateChange: (state) => {
        setCallSignalState(state || '');
        if (state === 'connected') {
          flushPendingIncomingIce();
          flushPendingOutgoingIce();
          setCallStage('active');
          setCallNotice('تم ربط الجلسة الصوتية/المرئية مع الطرف الآخر.');
        } else if (state === 'failed' || state === 'disconnected') {
          setCallNotice('انقطع الربط المباشر. سيتم الحفاظ على الجلسة ومحاولة الاستعادة تلقائيًا عند عودة الشبكة أو عند الرجوع من الخلفية.');
        }
      },
    });
    if (!engine?.ok) {
      setCallError(engine?.reason || 'تعذر تهيئة محرك المكالمة الأصلي.');
      return null;
    }
    callEngineRef.current = engine;
    try {
      const url = typeof engine.localStream?.toURL === 'function' ? engine.localStream.toURL() : '';
      if (url) setLocalPreviewUrl(url);
    } catch {}
    await flushPendingIncomingIce();
    flushPendingOutgoingIce();
    setNativeCallReady(true);
    setCallNotice((prev) => prev ? `${prev} · تم تجهيز مسار محلي Native.` : 'تم تجهيز مسار محلي Native.');
    return engine;
  }, [emitIceCandidate, flushPendingIncomingIce, flushPendingOutgoingIce]);

  const startNativeCall = useCallback(async (mode = 'audio') => {
    if (!selectedRoom) return;
    dismissNotificationById(callNotificationIdRef.current);
    callNotificationIdRef.current = null;
    const isGroupCall = !!selectedRoom?.isGroup || !!selectedRoom?.isChannel;
    const targetUserId = !isGroupCall
      ? selectedRoom?.members?.find((m) => m?.user?.id !== user?.id)?.user?.id || null
      : null;
    setIncomingCall(null);
    setCallPeerId(targetUserId);
    setCallIsGroup(isGroupCall);
    setCallMode(mode);
    setCallVisible(true);
    setCallStage('connecting');
    setCallSignalState('inviting');
    setCallChat([]);
    setCallRemoteReady(false);
    setCallNotice('جاري تهيئة المكالمة الأصلية على الجوال…');
    const permissionState = await applyPermissionsToCall(mode);
    await initNativeCallMedia(mode);
    if (isGroupCall) {
      socketRef.current?.emit('group_call_start', { conversationId: selectedRoom.id, callType: mode === 'video' ? 'video' : 'audio', effectMode: 'none' });
      socketRef.current?.emit('join_group_call', { conversationId: selectedRoom.id, callType: mode === 'video' ? 'video' : 'audio' });
      setCallParticipants([{ userId: user?.id, name: user?.name || 'أنت', joinedAt: new Date().toISOString() }]);
      setCallRoles({ [user?.id]: 'host' });
      setCallParticipantStates({ [user?.id]: 'live' });
      setCallStage('active');
      setCallSignalState('group-live');
      setCallNotice('بدأت المكالمة الجماعية. يمكنك دعوة الأعضاء والانضمام الكتابي أو الصوتي.');
    } else {
      socketRef.current?.emit('native_call_invite', {
        conversationId: selectedRoom.id,
        mode,
        roomName: conversationTitle(selectedRoom, user?.id),
        from: { id: user?.id, name: user?.name },
        targetUserId,
      });
      setCallStage('ringing');
      setCallNotice('تم إرسال طلب المكالمة. بانتظار قبول الطرف الآخر…');
    }
    if (!permissionState.microphone && !permissionState.camera) {
      setCallError('تعذر تفعيل الأجهزة حاليًا. يمكنك مواصلة الدردشة داخل المكالمة وإعادة المحاولة من الأزرار أدناه.');
    }
  }, [applyPermissionsToCall, initNativeCallMedia, selectedRoom, user?.id, user?.name]);

  const joinIncomingGroupCall = useCallback(async (sourceCall = incomingCall) => {
    if (!sourceCall?.conversationId) return;
    const room = await resolveRoomById(sourceCall.conversationId);
    if (room) {
      setSelectedRoom(room);
      loadMessages(room);
    }
    dismissNotificationById(callNotificationIdRef.current);
    callNotificationIdRef.current = null;
    setIncomingCall(null);
    setCallPeerId(sourceCall?.callerId || sourceCall?.from?.id || null);
    setCallIsGroup(true);
    setCallMode(sourceCall.mode || sourceCall.callType || 'audio');
    setCallVisible(true);
    setCallStage('connecting');
    setCallSignalState('joining-group');
    await applyPermissionsToCall(sourceCall.mode || sourceCall.callType || 'audio');
    await initNativeCallMedia(sourceCall.mode || sourceCall.callType || 'audio');
    socketRef.current?.emit('join_group_call', { conversationId: sourceCall.conversationId, callType: (sourceCall.mode || sourceCall.callType || 'audio') === 'video' ? 'video' : 'audio' });
    setCallNotice('تم الانضمام إلى المكالمة الجماعية. جاري مزامنة المشاركين والبث.');
  }, [applyPermissionsToCall, incomingCall, initNativeCallMedia, loadMessages, resolveRoomById]);

  const acceptIncomingCall = useCallback(async (sourceCall = incomingCall) => {
    if (!sourceCall) return;
    if (sourceCall?.isGroup) {
      await joinIncomingGroupCall(sourceCall);
      return;
    }
    const room = await resolveRoomById(sourceCall.conversationId);
    if (room) {
      setSelectedRoom(room);
      loadMessages(room);
    }
    dismissNotificationById(callNotificationIdRef.current);
    callNotificationIdRef.current = null;
    setCallPeerId(sourceCall?.from?.id || null);
    setIncomingCall(null);
    setCallIsGroup(false);
    setCallMode(sourceCall.mode || 'audio');
    setCallVisible(true);
    setCallStage('connecting');
    setCallSignalState('accepting');
    await applyPermissionsToCall(sourceCall.mode || 'audio');
    await initNativeCallMedia(sourceCall.mode || 'audio');
    socketRef.current?.emit('native_call_accept', { conversationId: sourceCall.conversationId, targetUserId: sourceCall?.from?.id, mode: sourceCall.mode || 'audio' });
    setCallNotice('تم قبول المكالمة. جاري استكمال الربط…');
  }, [applyPermissionsToCall, incomingCall, initNativeCallMedia, joinIncomingGroupCall, loadMessages, resolveRoomById]);

  const declineIncomingCall = useCallback((sourceCall = incomingCall) => {
    if (!sourceCall) return;
    dismissNotificationById(callNotificationIdRef.current);
    callNotificationIdRef.current = null;
    if (!sourceCall?.isGroup) {
      socketRef.current?.emit('native_call_decline', { conversationId: sourceCall.conversationId, targetUserId: sourceCall?.from?.id, reason: 'declined' });
    }
    setIncomingCall(null);
    setCallNotice(sourceCall?.isGroup ? 'تم تجاهل دعوة المكالمة الجماعية.' : 'تم رفض المكالمة.');
  }, [incomingCall]);

  useEffect(() => {
    if (!token || !pendingNotificationAction?.data?.conversationId) return;
    let active = true;
    (async () => {
      const { actionIdentifier, data } = pendingNotificationAction;
      if (!active) return;
      const normalized = {
        ...data,
        isGroup: !!data?.isGroup || data?.kind === 'incoming_group_call',
        mode: data?.mode || data?.callType || 'audio',
        from: data?.from || { id: data?.callerId || data?.fromUserId, name: data?.fromName || 'مستخدم' },
      };
      if (actionIdentifier === CALL_ACTION_DECLINE) {
        declineIncomingCall(normalized);
        setPendingNotificationAction(null);
        return;
      }
      if (actionIdentifier === CALL_ACTION_ACCEPT) {
        await acceptIncomingCall(normalized);
        setPendingNotificationAction(null);
        return;
      }
      const room = await resolveRoomById(normalized.conversationId);
      if (room) await openRoom(room);
      if (normalized?.kind === 'incoming_call' || normalized?.kind === 'incoming_group_call') {
        setIncomingCall(normalized);
      }
      setPendingNotificationAction(null);
    })();
    return () => { active = false; };
  }, [acceptIncomingCall, declineIncomingCall, openRoom, pendingNotificationAction, resolveRoomById, token]);

  const retryCallDevices = useCallback(async () => {
    setCallStage('connecting');
    await applyPermissionsToCall(callMode);
    await initNativeCallMedia(callMode);
    setCallStage('active');
  }, [applyPermissionsToCall, callMode, initNativeCallMedia]);

  const toggleMic = useCallback(() => {
    setCallControls((p) => {
      const next = !p.micEnabled;
      try { callEngineRef.current?.toggleAudio?.(next); } catch {}
      socketRef.current?.emit('native_call_state', { conversationId: selectedRoom?.id, targetUserId: callPeerId || undefined, state: { micEnabled: next, camEnabled: p.camEnabled } });
      return { ...p, micEnabled: next };
    });
  }, [callPeerId, selectedRoom?.id]);
  const toggleCamera = useCallback(() => {
    setCallControls((p) => {
      const next = !p.camEnabled;
      try { callEngineRef.current?.toggleVideo?.(next); } catch {}
      socketRef.current?.emit('native_call_state', { conversationId: selectedRoom?.id, targetUserId: callPeerId || undefined, state: { micEnabled: p.micEnabled, camEnabled: next } });
      return { ...p, camEnabled: next };
    });
  }, [callPeerId, selectedRoom?.id]);
  const switchCameraFacing = useCallback(() => {
    const ok = callEngineRef.current?.switchCamera?.();
    if (!ok) {
      setCallNotice('تبديل الكاميرا غير متاح بعد على هذه البنية.');
    }
  }, []);
  const toggleSpeaker = useCallback(() => setCallControls((p) => ({ ...p, speakerOn: !p.speakerOn })), []);

  const sendCallChat = useCallback(() => {
    const text = callComposer.trim();
    if (!text) return;
    const msg = { id: `call_${Date.now()}`, text, mine: true, createdAt: new Date().toISOString() };
    setCallChat((prev) => [...prev, msg]);
    if (callIsGroup) {
      socketRef.current?.emit('group_call_chat_message', { conversationId: selectedRoom?.id, text, clientId: msg.id });
    } else {
      socketRef.current?.emit('native_call_chat', { conversationId: selectedRoom?.id, message: msg });
    }
    if (callIsGroup) markActiveSpeaker(user?.id, 'نشاط حديث');
    setCallComposer('');
    requestAnimationFrame(() => callMessagesRef.current?.scrollToEnd?.({ animated: true }));
  }, [callComposer, callIsGroup, selectedRoom?.id, user?.id, markActiveSpeaker]);

  const toggleRaiseHand = useCallback(() => {
    if (!callIsGroup || !selectedRoom?.id) return;
    const next = !callRaiseHands[user?.id];
    setCallRaiseHands((prev) => ({ ...prev, [user?.id]: next }));
    socketRef.current?.emit('group_call_raise_hand', { conversationId: selectedRoom.id, raised: next });
  }, [callIsGroup, callRaiseHands, selectedRoom?.id, user?.id]);

  const sendGroupReaction = useCallback((reaction) => {
    if (!callIsGroup || !selectedRoom?.id) return;
    socketRef.current?.emit('group_call_reaction', { conversationId: selectedRoom.id, reaction });
    const item = { id: `mine_${Date.now()}`, userId: user?.id, reaction };
    setCallReactions((prev) => [...prev.slice(-5), item]);
    setTimeout(() => setCallReactions((prev) => prev.filter((r) => r.id !== item.id)), 2200);
  }, [callIsGroup, selectedRoom?.id, user?.id]);

  const toggleGroupRecording = useCallback(() => {
    if (!callIsGroup || !selectedRoom?.id) return;
    const next = !callRecording;
    setCallRecording(next);
    socketRef.current?.emit('group_call_recording', { conversationId: selectedRoom.id, enabled: next });
  }, [callIsGroup, callRecording, selectedRoom?.id]);

  const toggleGroupMuteAll = useCallback(() => {
    if (!callIsGroup || !selectedRoom?.id) return;
    const next = !callMuteAll;
    setCallMuteAll(next);
    socketRef.current?.emit('group_call_mute_all', { conversationId: selectedRoom.id, enabled: next });
  }, [callIsGroup, callMuteAll, selectedRoom?.id]);

  const admitPendingUser = useCallback((targetUserId) => {
    if (!callIsGroup || !selectedRoom?.id) return;
    socketRef.current?.emit('group_call_admit_joiner', { conversationId: selectedRoom.id, targetUserId });
    setCallPending((prev) => prev.filter((item) => item.userId !== targetUserId));
  }, [callIsGroup, selectedRoom?.id]);

  const setParticipantRole = useCallback((targetUserId, role) => {
    if (!callIsGroup || !selectedRoom?.id) return;
    socketRef.current?.emit('group_call_set_role', { conversationId: selectedRoom.id, targetUserId, role });
    setCallRoles((prev) => ({ ...prev, [targetUserId]: role }));
  }, [callIsGroup, selectedRoom?.id]);

  const removeFromGroupCall = useCallback((targetUserId) => {
    if (!callIsGroup || !selectedRoom?.id) return;
    socketRef.current?.emit('group_call_admin_action', { conversationId: selectedRoom.id, targetUserId, action: 'remove' });
    removeCallParticipant(targetUserId);
    setCallHostTarget(null);
  }, [callIsGroup, removeCallParticipant, selectedRoom?.id]);

  useEffect(() => () => {
    try { callEngineRef.current?.dispose?.(); } catch {}
    callEngineRef.current = null;
  }, []);

  const renderAuth = () => (
    <SafeAreaView style={styles.containerCenter}>
      <ExpoStatusBar style="light" />
      <View style={styles.authCard}>
        <Text style={styles.authTitle}>تواصل موبايل Native</Text>
        <Text style={styles.authSubtitle}>نسخة جوال أصلية للشاشات الأساسية والمكالمات التدريجية.</Text>
        {authMode === 'register' && (
          <TextInput style={styles.input} value={authForm.name} onChangeText={(v) => setAuthForm((p) => ({ ...p, name: v }))} placeholder="الاسم" placeholderTextColor="#6b8790" />
        )}
        <TextInput style={styles.input} value={authForm.email} onChangeText={(v) => setAuthForm((p) => ({ ...p, email: v }))} placeholder="الإيميل" autoCapitalize="none" keyboardType="email-address" placeholderTextColor="#6b8790" />
        <TextInput style={styles.input} value={authForm.password} onChangeText={(v) => setAuthForm((p) => ({ ...p, password: v }))} placeholder="كلمة المرور" secureTextEntry placeholderTextColor="#6b8790" />
        {!!authError && <Text style={styles.errorText}>{authError}</Text>}
        <TouchableOpacity style={styles.primaryButton} onPress={loginOrRegister} disabled={authBusy}>
          {authBusy ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryButtonText}>{authMode === 'login' ? 'تسجيل الدخول' : 'إنشاء حساب'}</Text>}
        </TouchableOpacity>
        <TouchableOpacity onPress={() => setAuthMode((p) => (p === 'login' ? 'register' : 'login'))}>
          <Text style={styles.linkText}>{authMode === 'login' ? 'ليس لديك حساب؟ أنشئ حسابًا' : 'لديك حساب؟ سجّل الدخول'}</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={() => setSettingsVisible(true)}><Text style={styles.secondaryLink}>إعداد الخادم</Text></TouchableOpacity>
      </View>
      {renderSettingsModal()}
    </SafeAreaView>
  );

  const renderRooms = () => (
    <View style={{ flex: 1 }}>
      <View style={styles.topBar}>
        <View>
          <Text style={styles.screenTitle}>المحادثات</Text>
          <Text style={styles.screenSubtitle}>{rooms.length} محادثة · Native</Text>
        </View>
        <View style={{ flexDirection: 'row-reverse', gap: 8 }}>
          <HeaderButton label="إنشاء" onPress={() => setCreateVisible(true)} />
          <HeaderButton label="Web" onPress={openAdvanced} />
        </View>
      </View>
      {roomsBusy ? <View style={styles.loadingFill}><ActivityIndicator size="large" color="#00a884" /></View> : (
        <FlatList
          data={rooms}
          keyExtractor={(item) => String(item.id)}
          contentContainerStyle={styles.roomsList}
          renderItem={({ item }) => (
            <TouchableOpacity style={styles.roomCard} onPress={() => openRoom(item)}>
              <Avatar name={conversationTitle(item, user?.id)} />
              <View style={{ flex: 1 }}>
                <View style={styles.roomTopRow}>
                  <Text style={styles.roomTitle} numberOfLines={1}>{conversationTitle(item, user?.id)}</Text>
                  <Text style={styles.roomTime}>{formatTime(item.updatedAt)}</Text>
                </View>
                <View style={styles.roomBottomRow}>
                  <Text style={styles.roomSubtitle} numberOfLines={1}>{conversationSubtitle(item, user?.id)}</Text>
                  {!!counts[item.id] && <View style={styles.unreadBadge}><Text style={styles.unreadBadgeText}>{counts[item.id]}</Text></View>}
                </View>
              </View>
            </TouchableOpacity>
          )}
          ListEmptyComponent={<EmptyState title="لا توجد محادثات" subtitle="أنشئ محادثة جديدة أو افتح النسخة المتقدمة مؤقتًا." />}
        />
      )}
    </View>
  );

  const renderSearch = () => (
    <ScrollView contentContainerStyle={styles.tabScroll}>
      <Text style={styles.screenTitle}>بحث وفتح خاص</Text>
      <TextInput style={styles.input} value={searchQuery} onChangeText={setSearchQuery} placeholder="ابحث بالاسم أو الإيميل أو ID" placeholderTextColor="#6b8790" />
      {searchBusy && <ActivityIndicator color="#00a884" style={{ marginVertical: 16 }} />}
      {(searchResults || []).map((item) => (
        <TouchableOpacity key={String(item.id)} style={styles.resultCard} onPress={async () => {
          const room = await api.openPrivate(item.id);
          await loadRooms();
          openRoom(room);
        }}>
          <Avatar name={item.name} />
          <View style={{ flex: 1 }}>
            <Text style={styles.resultName}>{item.name}</Text>
            <Text style={styles.resultMeta}>{item.email || item.publicId || 'مستخدم'}</Text>
          </View>
        </TouchableOpacity>
      ))}
      {!searchBusy && !!searchQuery && searchResults.length === 0 && <EmptyState title="لا توجد نتائج" subtitle="جرّب اسمًا أو إيميلًا مختلفًا." />}
    </ScrollView>
  );

  const renderSettings = () => (
    <ScrollView contentContainerStyle={styles.tabScroll}>
      <Text style={styles.screenTitle}>الإعدادات والملف الشخصي</Text>
      <View style={styles.settingsCard}>
        <Text style={styles.settingsTitle}>الملف الشخصي</Text>
        <TextInput style={styles.input} value={profileForm.name} onChangeText={(v) => setProfileForm((p) => ({ ...p, name: v }))} placeholder="الاسم" placeholderTextColor="#6b8790" />
        <TextInput style={[styles.input, styles.multilineInput]} value={profileForm.bio} onChangeText={(v) => setProfileForm((p) => ({ ...p, bio: v }))} placeholder="نبذة" placeholderTextColor="#6b8790" multiline />
        <TextInput style={styles.input} value={profileForm.phone} onChangeText={(v) => setProfileForm((p) => ({ ...p, phone: v }))} placeholder="الهاتف" placeholderTextColor="#6b8790" />
        {!!profileError && <Text style={styles.errorText}>{profileError}</Text>}
        {!!profileSaved && <Text style={styles.okText}>{profileSaved}</Text>}
        <TouchableOpacity style={styles.primaryButton} onPress={saveProfile} disabled={profileBusy}>
          {profileBusy ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryButtonText}>حفظ التغييرات</Text>}
        </TouchableOpacity>
      </View>
      <View style={styles.settingsCard}>
        <Text style={styles.settingsTitle}>الخادم</Text>
        <Text style={styles.settingsDesc}>العنوان الحالي: {apiUrl}</Text>
        <TouchableOpacity style={styles.secondaryButton} onPress={() => setSettingsVisible(true)}><Text style={styles.secondaryButtonText}>تعديل إعداد الخادم</Text></TouchableOpacity>
        <TouchableOpacity style={[styles.secondaryButton, { marginTop: 10 }]} onPress={logout}><Text style={styles.secondaryButtonText}>تسجيل الخروج</Text></TouchableOpacity>
      </View>
    </ScrollView>
  );

  const renderChat = () => {
    if (!selectedRoom) return <EmptyState title="اختر محادثة" subtitle="من تبويب المحادثات أو البحث." />;
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.chatHeader}>
          <TouchableOpacity style={styles.backPill} onPress={() => setSelectedRoom(null)}><Text style={styles.backPillText}>رجوع</Text></TouchableOpacity>
          <View style={{ flex: 1 }}>
            <Text style={styles.chatTitle}>{conversationTitle(selectedRoom, user?.id)}</Text>
            <Text style={styles.chatSubtitle}>{conversationSubtitle(selectedRoom, user?.id)}</Text>
          </View>
          <HeaderButton label="صوت" onPress={() => startNativeCall('audio')} />
          <HeaderButton label="فيديو" onPress={() => startNativeCall('video')} />
        </View>
        {messagesBusy ? <View style={styles.loadingFill}><ActivityIndicator size="large" color="#00a884" /></View> : (
          <FlatList
            ref={messagesRef}
            data={messages}
            keyExtractor={(item) => String(item.id)}
            contentContainerStyle={styles.messagesList}
            renderItem={({ item }) => {
              const mine = item.senderId === user?.id;
              return (
                <View style={[styles.messageWrap, mine ? styles.mineWrap : styles.theirWrap]}>
                  {!mine && <Text style={styles.senderName}>{item.sender?.name || 'عضو'}</Text>}
                  <View style={[styles.bubble, mine ? styles.myBubble : styles.theirBubble]}>
                    {!!item.text && <Text style={styles.bubbleText}>{item.text}</Text>}
                    {!!item.fileName && <Text style={styles.attachmentMeta}>📎 {item.fileName}</Text>}
                    <Text style={styles.bubbleTime}>{bubbleTime(item.createdAt)}</Text>
                  </View>
                </View>
              );
            }}
            ListEmptyComponent={<EmptyState title="لا توجد رسائل بعد" subtitle="ابدأ رسالة جديدة أو أرسل وسائط من أسفل الشاشة." />}
          />
        )}
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <View style={styles.composerWrap}>
            <TouchableOpacity style={styles.attachButton} onPress={pickImageAttachment} disabled={uploadBusy}><Text style={styles.attachButtonText}>{uploadBusy ? '...' : 'وسائط'}</Text></TouchableOpacity>
            <TouchableOpacity style={styles.attachButton} onPress={pickFileAttachment} disabled={uploadBusy}><Text style={styles.attachButtonText}>ملف</Text></TouchableOpacity>
            <TextInput style={styles.composerInput} value={composer} onChangeText={setComposer} placeholder="اكتب رسالة…" placeholderTextColor="#6b8790" multiline />
            <TouchableOpacity style={styles.sendButton} onPress={sendMessage}><Text style={styles.sendButtonText}>إرسال</Text></TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </SafeAreaView>
    );
  };

  const renderCreateModal = () => (
    <Modal visible={createVisible} transparent animationType="slide" onRequestClose={() => setCreateVisible(false)}>
      <View style={styles.modalBackdrop}><View style={styles.modalSheet}>
        <Text style={styles.modalTitle}>إنشاء جديد</Text>
        <View style={styles.segmentRow}>
          <Pressable style={[styles.segment, createForm.isGroup && !createForm.isChannel && styles.segmentActive]} onPress={() => setCreateForm((p) => ({ ...p, isGroup: true, isChannel: false }))}><Text style={[styles.segmentText, createForm.isGroup && !createForm.isChannel && styles.segmentTextActive]}>مجموعة</Text></Pressable>
          <Pressable style={[styles.segment, createForm.isChannel && styles.segmentActive]} onPress={() => setCreateForm((p) => ({ ...p, isGroup: false, isChannel: true }))}><Text style={[styles.segmentText, createForm.isChannel && styles.segmentTextActive]}>قناة</Text></Pressable>
        </View>
        <TextInput style={styles.input} value={createForm.name} onChangeText={(v) => setCreateForm((p) => ({ ...p, name: v }))} placeholder="اسم المجموعة أو القناة" placeholderTextColor="#6b8790" />
        <TextInput style={[styles.input, styles.multilineInput]} multiline value={createForm.description} onChangeText={(v) => setCreateForm((p) => ({ ...p, description: v }))} placeholder="الوصف" placeholderTextColor="#6b8790" />
        <TextInput style={[styles.input, styles.multilineInput]} multiline value={createForm.welcomeMsg} onChangeText={(v) => setCreateForm((p) => ({ ...p, welcomeMsg: v }))} placeholder="رسالة الترحيب" placeholderTextColor="#6b8790" />
        <TextInput style={styles.input} value={createForm.topic} onChangeText={(v) => setCreateForm((p) => ({ ...p, topic: v }))} placeholder="موضوع أو تصنيف" placeholderTextColor="#6b8790" />
        <TextInput style={styles.input} value={createForm.tags} onChangeText={(v) => setCreateForm((p) => ({ ...p, tags: v }))} placeholder="وسوم مفصولة بفاصلة" placeholderTextColor="#6b8790" />
        <TouchableOpacity style={styles.toggleRow} onPress={() => setCreateForm((p) => ({ ...p, requireApproval: !p.requireApproval }))}>
          <Text style={styles.toggleLabel}>يتطلب موافقة قبل الانضمام</Text>
          <View style={[styles.toggleBadge, createForm.requireApproval && styles.toggleBadgeActive]}><Text style={styles.toggleBadgeText}>{createForm.requireApproval ? 'نعم' : 'لا'}</Text></View>
        </TouchableOpacity>
        {!!createError && <Text style={styles.errorText}>{createError}</Text>}
        <View style={styles.inlineRow}>
          <TouchableOpacity style={styles.secondaryButton} onPress={() => setCreateVisible(false)}><Text style={styles.secondaryButtonText}>إلغاء</Text></TouchableOpacity>
          <TouchableOpacity style={styles.primaryButtonSmall} onPress={createRoom} disabled={createBusy}>{createBusy ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryButtonText}>إنشاء</Text>}</TouchableOpacity>
        </View>
      </View></View>
    </Modal>
  );

  const renderSettingsModal = () => (
    <Modal visible={settingsVisible} transparent animationType="slide" onRequestClose={() => setSettingsVisible(false)}>
      <View style={styles.modalBackdrop}><View style={styles.modalSheet}>
        <Text style={styles.modalTitle}>إعداد الخادم</Text>
        <Text style={styles.modalDesc}>اكتب عنوان API وسيتم حفظه للتطبيق المحلي.</Text>
        <TextInput style={styles.input} value={serverDraft} onChangeText={setServerDraft} placeholder="https://11.0.0.103:4000" autoCapitalize="none" placeholderTextColor="#6b8790" />
        <View style={styles.inlineRow}>
          <TouchableOpacity style={styles.secondaryButton} onPress={() => setServerDraft(deriveApiUrlFromWeb(DEFAULT_WEB_URL))}><Text style={styles.secondaryButtonText}>عنوان جاهز</Text></TouchableOpacity>
          <TouchableOpacity style={styles.secondaryButton} onPress={() => verifyServer(serverDraft)}><Text style={styles.secondaryButtonText}>فحص</Text></TouchableOpacity>
        </View>
        {serverBusy && <ActivityIndicator color="#00a884" style={{ marginVertical: 10 }} />}
        {!!serverError && <Text style={styles.errorText}>{serverError}</Text>}
        {!!serverStatus && <Text style={styles.okText}>الخادم متصل · الإصدار {serverStatus.version || 'غير معروف'}</Text>}
        <View style={styles.inlineRow}>
          <TouchableOpacity style={styles.secondaryButton} onPress={() => setSettingsVisible(false)}><Text style={styles.secondaryButtonText}>إغلاق</Text></TouchableOpacity>
          <TouchableOpacity style={styles.primaryButtonSmall} onPress={saveServer}><Text style={styles.primaryButtonText}>حفظ</Text></TouchableOpacity>
        </View>
      </View></View>
    </Modal>
  );

  const spotlightParticipant = useMemo(() => {
    if (!callIsGroup) return null;
    const screenSharerId = Object.keys(callScreenSharers || {}).find((key) => callScreenSharers[key]);
    const targetId = callPinnedUserId || (screenSharerId ? Number(screenSharerId) : null) || callActiveSpeakerId || callParticipants?.[0]?.userId || null;
    return callParticipants.find((item) => item.userId === targetId) || null;
  }, [callIsGroup, callParticipants, callPinnedUserId, callScreenSharers, callActiveSpeakerId]);


  const sortedCallParticipants = useMemo(() => {
    const score = (item) => {
      let value = 0;
      if (callPinnedUserId === item.userId) value += 100;
      if (callScreenSharers?.[item.userId]) value += 80;
      if (callActiveSpeakerId === item.userId) value += 60;
      const role = callRoles?.[item.userId];
      if (role === 'host') value += 40;
      else if (role === 'presenter' || role === 'admin') value += 30;
      if (callRaiseHands?.[item.userId]) value += 8;
      return value;
    };
    return [...(callParticipants || [])].sort((a, b) => score(b) - score(a) || String(a.name || '').localeCompare(String(b.name || '')));
  }, [callParticipants, callPinnedUserId, callScreenSharers, callActiveSpeakerId, callRoles, callRaiseHands]);

  const stageParticipants = useMemo(() => sortedCallParticipants.filter((item) => {
    const role = callRoles?.[item.userId];
    return callScreenSharers?.[item.userId] || role === 'host' || role === 'presenter' || item.userId === callPinnedUserId || item.userId === callActiveSpeakerId;
  }).slice(0, 6), [sortedCallParticipants, callRoles, callScreenSharers, callPinnedUserId, callActiveSpeakerId]);

  const callSummary = useMemo(() => ({
    total: callParticipants.length,
    onStage: stageParticipants.length,
    hands: Object.values(callRaiseHands || {}).filter(Boolean).length,
    waiting: callPending.length,
  }), [callParticipants.length, stageParticipants.length, callRaiseHands, callPending.length]);

  const admitAllPending = useCallback(() => {
    if (!callPending.length) return;
    callPending.forEach((item) => {
      socketRef.current?.emit('group_call_admit_joiner', { conversationId: selectedRoom?.id, targetUserId: item.userId });
    });
    setCallPending([]);
  }, [callPending, selectedRoom?.id]);

  const pinParticipant = useCallback((targetUserId) => {
    setCallPinnedUserId((prev) => prev === targetUserId ? null : targetUserId);
    if (targetUserId) setCallAutoPinEnabled(false);
  }, []);

  const spotlightPreviewUrl = useMemo(() => {
    if (!spotlightParticipant) return '';
    if (spotlightParticipant.userId === user?.id) return localPreviewUrl;
    return remotePreviewUrl;
  }, [spotlightParticipant, user?.id, localPreviewUrl, remotePreviewUrl]);

  const renderIncomingCallModal = () => (
    <Modal visible={!!incomingCall} transparent animationType="fade" onRequestClose={() => setIncomingCall(null)}>
      <View style={styles.modalBackdrop}><View style={styles.incomingCard}>
        <Text style={styles.modalTitle}>{incomingCall?.isGroup ? 'دعوة لمكالمة جماعية' : 'مكالمة واردة'}</Text>
        <Text style={styles.infoPrimary}>{incomingCall?.roomName || 'محادثة'}</Text>
        <Text style={styles.infoSecondary}>من {incomingCall?.from?.name || 'مستخدم'} · {incomingCall?.mode === 'video' ? 'فيديو' : 'صوت'}{incomingCall?.isGroup ? ' · جماعي' : ''}</Text>
        <View style={styles.inlineRow}>
          <TouchableOpacity style={styles.secondaryButton} onPress={() => declineIncomingCall()}><Text style={styles.secondaryButtonText}>رفض</Text></TouchableOpacity>
          <TouchableOpacity style={styles.primaryButtonSmall} onPress={acceptIncomingCall}><Text style={styles.primaryButtonText}>قبول</Text></TouchableOpacity>
        </View>
      </View></View>
    </Modal>
  );

  const renderCallModal = () => (
    <Modal visible={callVisible} animationType="slide" onRequestClose={closeCall}>
      <SafeAreaView style={styles.container}>
        <View style={styles.chatHeader}>
          <TouchableOpacity style={styles.backPill} onPress={closeCall}><Text style={styles.backPillText}>عودة</Text></TouchableOpacity>
          <View style={{ flex: 1 }}>
            <Text style={styles.chatTitle}>{callIsGroup ? (callMode === 'video' ? 'مكالمة جماعية Native' : 'غرفة صوتية جماعية') : (callMode === 'video' ? 'مكالمة فيديو Native' : 'مكالمة صوت Native')}</Text>
            <Text style={styles.chatSubtitle}>{conversationTitle(selectedRoom, user?.id)}{callIsGroup ? ` · ${callParticipants.length} مشارك` : ''}</Text>
          </View>
          <HeaderButton label="إنهاء" onPress={closeCall} danger />
        </View>
        <View style={[styles.callCard, callIsGroup && styles.callCardGroup]}>
          <View style={styles.callHeroRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.callStage}>{callIsGroup ? (callStage === 'active' ? 'المكالمة الجماعية مباشرة' : 'جاري تجهيز الغرفة…') : (callStage === 'connecting' ? 'جاري الربط…' : callStage === 'ringing' ? 'بانتظار الرد…' : callStage === 'ended' ? 'انتهت المكالمة' : 'المكالمة جاهزة')}</Text>
              <Text style={styles.callMeta}>{callIsGroup ? `${callParticipants.length} مشارك · ${callSignalState || 'group-live'}${callActiveSpeakerId ? ' · متحدث نشط' : ''}` : (callSignalState === 'connected' || callRemoteReady ? 'تم ربط الطرف الآخر' : callSignalState || 'جاهز')}</Text>
            </View>
            <View style={styles.callHeroBadges}>
              {callRecording ? <View style={[styles.callHeroBadge, styles.callHeroBadgeDanger]}><Text style={styles.callHeroBadgeText}>REC</Text></View> : null}
              {callMuteAll ? <View style={styles.callHeroBadge}><Text style={styles.callHeroBadgeText}>كتم الجميع</Text></View> : null}
              {callWaitingRoom ? <View style={styles.callHeroBadge}><Text style={styles.callHeroBadgeText}>غرفة انتظار</Text></View> : null}
            </View>
          </View>
          <Text style={styles.callNotice}>{callNotice}</Text>
          {!!callError && <Text style={styles.errorText}>{callError}</Text>}
          {callIsGroup && callReactions.length ? <View style={styles.reactionStrip}>{callReactions.map((item) => <Text key={item.id} style={styles.reactionBubble}>{item.reaction}</Text>)}</View> : null}
          <View style={styles.callPreviewWrap}>
            <View style={styles.callPreviewCard}>
              <Text style={styles.previewLabel}>المعاينة المحلية</Text>
              {(RTCView && localPreviewUrl) ? <RTCView streamURL={localPreviewUrl} style={styles.callPreviewVideo} objectFit="cover" mirror /> : <View style={styles.callPreviewPlaceholder}><Text style={styles.callPreviewText}>{nativeCallReady ? 'الصوت/الفيديو المحلي جاهز' : 'لا توجد معاينة محلية بعد'}</Text></View>}
            </View>
            <View style={styles.callPreviewCard}>
              <Text style={styles.previewLabel}>الطرف الآخر</Text>
              {(RTCView && remotePreviewUrl) ? <RTCView streamURL={remotePreviewUrl} style={styles.callPreviewVideo} objectFit="cover" /> : <View style={styles.callPreviewPlaceholder}><Text style={styles.callPreviewText}>بانتظار stream بعيد أو قبول الإشارة</Text></View>}
            </View>
          </View>
          <View style={styles.infoGrid}>
            <View style={[styles.infoChip, nativeCallReady && styles.infoChipOk]}><Text style={styles.infoChipText}>{nativeCallReady ? 'محرك Native جاهز' : 'محرك Native احتياطي'}</Text></View>
            <View style={styles.infoChip}><Text style={styles.infoChipText}>{callMode === 'video' ? 'وضع فيديو' : 'وضع صوت'}</Text></View>
            <View style={[styles.infoChip, callDevices.microphone && styles.infoChipOk]}><Text style={styles.infoChipText}>{callDevices.microphone ? 'مايك متاح' : 'بدون مايك'}</Text></View>
            <View style={[styles.infoChip, callDevices.camera && styles.infoChipOk]}><Text style={styles.infoChipText}>{callDevices.camera ? 'كاميرا متاحة' : 'بدون كاميرا'}</Text></View>
            <View style={[styles.infoChip, styles.infoChipOk]}><Text style={styles.infoChipText}>{callControls.speakerOn ? 'السماعة مفعلة' : 'السماعة مخفضة'}</Text></View>
          </View>
          <View style={styles.callControlsRow}>
            <TouchableOpacity style={[styles.callControlButton, !callControls.micEnabled && styles.callControlButtonOff]} onPress={toggleMic}><Text style={styles.callControlButtonText}>{callControls.micEnabled ? 'كتم المايك' : 'تفعيل المايك'}</Text></TouchableOpacity>
            <TouchableOpacity style={[styles.callControlButton, !callControls.camEnabled && styles.callControlButtonOff]} onPress={toggleCamera}><Text style={styles.callControlButtonText}>{callControls.camEnabled ? 'إيقاف الكاميرا' : 'تفعيل الكاميرا'}</Text></TouchableOpacity>
          </View>
          <View style={styles.callControlsRow}>
            <TouchableOpacity style={styles.secondaryButton} onPress={toggleSpeaker}><Text style={styles.secondaryButtonText}>{callControls.speakerOn ? 'خفض السماعة' : 'رفع السماعة'}</Text></TouchableOpacity>
            <TouchableOpacity style={styles.secondaryButton} onPress={switchCameraFacing}><Text style={styles.secondaryButtonText}>تبديل الكاميرا</Text></TouchableOpacity>
            <TouchableOpacity style={styles.secondaryButton} onPress={retryCallDevices}><Text style={styles.secondaryButtonText}>إعادة محاولة الأجهزة</Text></TouchableOpacity>
          </View>
          {callIsGroup ? (
            <>
              <View style={styles.groupStageCard}>
                <View style={styles.groupStageHeader}>
                  <Text style={styles.groupStageTitle}>{callLayoutMode === 'spotlight' ? 'وضع التركيز' : callLayoutMode === 'grid' ? 'الشبكة' : 'شبكة كثيفة'}</Text>
                  <TouchableOpacity style={styles.groupLayoutBtn} onPress={cycleCallLayout}><Text style={styles.groupLayoutText}>تبديل التخطيط</Text></TouchableOpacity>
                </View>
                <View style={styles.groupStageMetrics}>
                  <View style={styles.groupMetric}><Text style={styles.groupMetricValue}>{callSummary.total}</Text><Text style={styles.groupMetricLabel}>إجمالي</Text></View>
                  <View style={styles.groupMetric}><Text style={styles.groupMetricValue}>{callSummary.onStage}</Text><Text style={styles.groupMetricLabel}>على المسرح</Text></View>
                  <View style={styles.groupMetric}><Text style={styles.groupMetricValue}>{callSummary.hands}</Text><Text style={styles.groupMetricLabel}>رفع يد</Text></View>
                  <View style={styles.groupMetric}><Text style={styles.groupMetricValue}>{callSummary.waiting}</Text><Text style={styles.groupMetricLabel}>انتظار</Text></View>
                </View>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.stageRail}>
                  {stageParticipants.length ? stageParticipants.map((p) => (
                    <TouchableOpacity key={`stage_${p.userId}`} style={[styles.stageChip, callPinnedUserId === p.userId && styles.stageChipPinned]} onPress={() => pinParticipant(p.userId)}>
                      <Avatar name={p.name || `عضو ${p.userId}`} size={28} />
                      <View style={{ flex: 1 }}>
                        <Text style={styles.stageChipName} numberOfLines={1}>{p.name || `عضو ${p.userId}`}</Text>
                        <Text style={styles.stageChipMeta} numberOfLines={1}>{callScreenSharers?.[p.userId] ? 'يشارك الشاشة' : (callActiveSpeakerId === p.userId ? 'يتحدث الآن' : (callRoles?.[p.userId] || 'member'))}</Text>
                      </View>
                    </TouchableOpacity>
                  )) : <Text style={styles.groupEmptyHint}>سيظهر المسرح هنا عند وجود متحدثين أو مقدّمين.</Text>}
                </ScrollView>
                <View style={styles.groupSpotlightCard}>
                  <View style={styles.groupSpotlightMedia}>
                    {(RTCView && spotlightPreviewUrl) ? <RTCView streamURL={spotlightPreviewUrl} style={styles.groupSpotlightVideo} objectFit="cover" mirror={spotlightParticipant?.userId === user?.id} /> : <View style={styles.groupSpotlightPlaceholder}><Avatar name={spotlightParticipant?.name || 'بدون تثبيت'} size={56} /></View>}
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.groupSpotlightName}>{spotlightParticipant?.name || 'اختر مشاركًا للتثبيت'}</Text>
                    <Text style={styles.groupSpotlightMeta}>{spotlightParticipant ? `${callRoles?.[spotlightParticipant.userId] || 'member'} · ${callParticipantStates?.[spotlightParticipant.userId] || 'live'}${callActiveSpeakerId === spotlightParticipant.userId ? ' · يتحدث الآن' : ''}` : 'سيظهر هنا المشارك المثبت أو من يشارك الشاشة'}</Text>
                  </View>
                  {spotlightParticipant && callScreenSharers?.[spotlightParticipant.userId] ? <View style={styles.callHeroBadge}><Text style={styles.callHeroBadgeText}>يشارك الشاشة</Text></View> : null}
                </View>
              </View>
              <View style={[styles.participantGrid, callLayoutMode === 'compact' && styles.participantGridCompact]}>
                {sortedCallParticipants.map((p) => (
                  <TouchableOpacity key={String(p.userId)} style={[styles.participantCard, callPinnedUserId === p.userId && styles.participantCardPinned, callActiveSpeakerId === p.userId && styles.participantCardActive, callLayoutMode === 'compact' && styles.participantCardCompact]} onPress={() => {
                    pinParticipant(p.userId);
                    setCallHostTarget((prev) => prev === p.userId ? null : p.userId);
                  }}>
                    <Avatar name={p.name || `عضو ${p.userId}`} size={callLayoutMode === 'compact' ? 34 : 38} />
                    <Text style={styles.participantName} numberOfLines={1}>{p.name || `عضو ${p.userId}`}</Text>
                    <Text style={styles.participantRole}>{callRoles?.[p.userId] || (p.userId === user?.id ? 'host' : 'member')}</Text>
                    <Text style={styles.participantState}>{callActiveSpeakerId === p.userId ? 'يتحدث الآن' : (callParticipantStates?.[p.userId] || 'live')}</Text>
                    {callRaiseHands?.[p.userId] ? <Text style={styles.participantHand}>✋</Text> : null}
                    {callScreenSharers?.[p.userId] ? <Text style={styles.participantScreen}>🖥</Text> : null}
                    {callActiveSpeakerId === p.userId ? <Text style={styles.participantSpeaker}>🎙</Text> : null}
                  </TouchableOpacity>
                ))}
              </View>
              <View style={styles.groupQuickActions}>
                <TouchableOpacity style={styles.groupActionBtn} onPress={toggleRaiseHand}><Text style={styles.groupActionText}>{callRaiseHands?.[user?.id] ? 'إنزال اليد' : 'رفع اليد'}</Text></TouchableOpacity>
                <TouchableOpacity style={styles.groupActionBtn} onPress={() => sendGroupReaction('👏')}><Text style={styles.groupActionText}>👏 تفاعل</Text></TouchableOpacity>
                <TouchableOpacity style={styles.groupActionBtn} onPress={toggleGroupRecording}><Text style={styles.groupActionText}>{callRecording ? 'إيقاف التسجيل' : 'تسجيل'}</Text></TouchableOpacity>
                <TouchableOpacity style={styles.groupActionBtn} onPress={toggleGroupMuteAll}><Text style={styles.groupActionText}>{callMuteAll ? 'إلغاء كتم الجميع' : 'كتم الجميع'}</Text></TouchableOpacity>
                <TouchableOpacity style={[styles.groupActionBtn, callAutoPinEnabled && styles.groupActionBtnActive]} onPress={() => setCallAutoPinEnabled((prev) => !prev)}><Text style={styles.groupActionText}>{callAutoPinEnabled ? 'إيقاف التثبيت التلقائي' : 'تثبيت تلقائي'}</Text></TouchableOpacity>
              </View>
              {!!callPending.length && <View style={styles.hostPanel}><View style={styles.hostPanelHeader}><Text style={styles.hostPanelTitle}>غرفة الانتظار · {callPending.length}</Text><TouchableOpacity style={styles.hostMiniBtn} onPress={admitAllPending}><Text style={styles.hostMiniBtnText}>قبول الكل</Text></TouchableOpacity></View>{callPending.slice(0,4).map((item) => <View key={String(item.userId)} style={styles.hostPendingRow}><Text style={styles.hostPendingText}>{item.name || `عضو ${item.userId}`}</Text><TouchableOpacity style={styles.hostMiniBtn} onPress={() => admitPendingUser(item.userId)}><Text style={styles.hostMiniBtnText}>قبول</Text></TouchableOpacity></View>)}</View>}
              {callHostTarget && isCallHost() ? <View style={styles.hostPanel}><Text style={styles.hostPanelTitle}>إدارة المضيف · {callParticipants.find((p) => p.userId === callHostTarget)?.name || callHostTarget}</Text><View style={styles.hostPanelActions}><TouchableOpacity style={styles.hostMiniBtn} onPress={() => pinParticipant(callHostTarget)}><Text style={styles.hostMiniBtnText}>{callPinnedUserId === callHostTarget ? 'إلغاء التثبيت' : 'تثبيت'}</Text></TouchableOpacity><TouchableOpacity style={styles.hostMiniBtn} onPress={() => setParticipantRole(callHostTarget, 'presenter')}><Text style={styles.hostMiniBtnText}>مقدّم</Text></TouchableOpacity><TouchableOpacity style={styles.hostMiniBtn} onPress={() => setParticipantRole(callHostTarget, 'listener')}><Text style={styles.hostMiniBtnText}>مستمع</Text></TouchableOpacity><TouchableOpacity style={[styles.hostMiniBtn, styles.hostMiniBtnDanger]} onPress={() => removeFromGroupCall(callHostTarget)}><Text style={styles.hostMiniBtnText}>إزالة</Text></TouchableOpacity></View></View> : null}
            </>
          ) : null}
        </View>
        <FlatList
          ref={callMessagesRef}
          data={callChat}
          keyExtractor={(item) => String(item.id)}
          contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 10 }}
          renderItem={({ item }) => (
            <View style={[styles.messageWrap, item.mine ? styles.mineWrap : styles.theirWrap]}>
              <View style={[styles.bubble, item.mine ? styles.myBubble : styles.theirBubble]}>
                {!item.mine && !!item.senderName && callIsGroup ? <Text style={styles.callSenderName}>{item.senderName}</Text> : null}
                <Text style={styles.bubbleText}>{item.text}</Text>
                <Text style={styles.bubbleTime}>{bubbleTime(item.createdAt)}</Text>
              </View>
            </View>
          )}
          ListEmptyComponent={<EmptyState title="الدردشة داخل المكالمة جاهزة" subtitle="يمكنك مواصلة الكتابة حتى لو تعذر الصوت أو الفيديو." />}
        />
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <View style={styles.composerWrap}>
            <TextInput style={styles.composerInput} value={callComposer} onChangeText={setCallComposer} placeholder="اكتب داخل جلسة الاتصال…" placeholderTextColor="#6b8790" multiline />
            <TouchableOpacity style={styles.sendButton} onPress={sendCallChat}><Text style={styles.sendButtonText}>إرسال</Text></TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </Modal>
  );

  const renderAdvancedModal = () => (
    <Modal visible={advancedVisible} animationType="slide" onRequestClose={() => setAdvancedVisible(false)}>
      <SafeAreaView style={styles.container}>
        <View style={styles.chatHeader}>
          <TouchableOpacity style={styles.backPill} onPress={() => setAdvancedVisible(false)}><Text style={styles.backPillText}>إغلاق</Text></TouchableOpacity>
          <View style={{ flex: 1 }}>
            <Text style={styles.chatTitle}>النسخة المتقدمة</Text>
            <Text style={styles.chatSubtitle}>Fallback للميزات الثقيلة مؤقتًا</Text>
          </View>
          <HeaderButton label="تحديث" onPress={() => webRef.current?.reload?.()} />
        </View>
        {webLoading && <View style={styles.webOverlay}><ActivityIndicator size="large" color="#00a884" /></View>}
        <WebView
          ref={webRef}
          source={{ uri: webUrl }}
          onNavigationStateChange={(state) => setWebCanGoBack(state.canGoBack)}
          onLoadStart={() => setWebLoading(true)}
          onLoadEnd={() => setWebLoading(false)}
          mixedContentMode="always"
        />
      </SafeAreaView>
    </Modal>
  );

  if (booting) {
    return <SafeAreaView style={styles.containerCenter}><ActivityIndicator size="large" color="#00a884" /></SafeAreaView>;
  }

  if (!token) {
    return renderAuth();
  }

  return (
    <SafeAreaView style={styles.container}>
      <ExpoStatusBar style="light" />
      {selectedRoom ? renderChat() : mobileTab === 'rooms' ? renderRooms() : mobileTab === 'search' ? renderSearch() : renderSettings()}
      {!selectedRoom && (
        <View style={styles.bottomNav}>
          <NavButton label="المحادثات" active={mobileTab === 'rooms'} onPress={() => setMobileTab('rooms')} />
          <NavButton label="البحث" active={mobileTab === 'search'} onPress={() => setMobileTab('search')} />
          <NavButton label="الإعدادات" active={mobileTab === 'settings'} onPress={() => setMobileTab('settings')} />
        </View>
      )}
      {renderCreateModal()}
      {renderSettingsModal()}
      {renderIncomingCallModal()}
      {renderCallModal()}
      {renderAdvancedModal()}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#071216' },
  containerCenter: { flex: 1, backgroundColor: '#071216', alignItems: 'center', justifyContent: 'center' },
  authCard: { width: '90%', backgroundColor: '#0d1b22', borderRadius: 24, padding: 20, borderWidth: 1, borderColor: '#17303a', gap: 12 },
  authTitle: { color: '#f4fbff', fontWeight: '900', fontSize: 26, textAlign: 'center' },
  authSubtitle: { color: '#8fa6ae', textAlign: 'center', lineHeight: 22, marginBottom: 8 },
  input: { backgroundColor: '#102028', borderRadius: 16, paddingHorizontal: 14, paddingVertical: 14, color: '#f4fbff', borderWidth: 1, borderColor: '#1d3440', textAlign: 'right' },
  multilineInput: { minHeight: 90, textAlignVertical: 'top' },
  primaryButton: { backgroundColor: '#00a884', borderRadius: 18, paddingVertical: 16, alignItems: 'center', justifyContent: 'center' },
  primaryButtonSmall: { flex: 1, backgroundColor: '#00a884', borderRadius: 16, paddingVertical: 14, alignItems: 'center', justifyContent: 'center' },
  primaryButtonText: { color: '#fff', fontWeight: '800' },
  linkText: { color: '#7cdcc5', textAlign: 'center', marginTop: 4 },
  secondaryLink: { color: '#9db1b8', textAlign: 'center', marginTop: 6 },
  errorText: { color: '#ff8e8e', textAlign: 'right', lineHeight: 21 },
  okText: { color: '#8ff0c9', textAlign: 'right', lineHeight: 21 },
  topBar: { paddingHorizontal: 16, paddingTop: 16, paddingBottom: 8, flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'space-between' },
  screenTitle: { color: '#f4fbff', fontWeight: '900', fontSize: 22, textAlign: 'right' },
  screenSubtitle: { color: '#88a0a8', textAlign: 'right', marginTop: 4 },
  headerButton: { backgroundColor: '#102028', borderRadius: 14, paddingHorizontal: 12, paddingVertical: 10, borderWidth: 1, borderColor: '#1f3945' },
  headerButtonDanger: { borderColor: '#5a2f39', backgroundColor: '#2b1d22' },
  headerButtonText: { color: '#d7e5e9', fontWeight: '700' },
  headerButtonTextDanger: { color: '#ffd1d6' },
  avatar: { backgroundColor: '#00a884', alignItems: 'center', justifyContent: 'center' },
  avatarText: { color: '#fff', fontWeight: '900' },
  roomsList: { paddingHorizontal: 16, paddingBottom: 96 },
  roomCard: { backgroundColor: '#0d1b22', borderRadius: 20, padding: 14, marginBottom: 10, flexDirection: 'row-reverse', gap: 12, alignItems: 'center', borderWidth: 1, borderColor: '#17303a' },
  roomTopRow: { flexDirection: 'row-reverse', justifyContent: 'space-between', alignItems: 'center' },
  roomBottomRow: { flexDirection: 'row-reverse', justifyContent: 'space-between', alignItems: 'center', marginTop: 8, gap: 12 },
  roomTitle: { color: '#f4fbff', fontWeight: '800', fontSize: 16, flex: 1, textAlign: 'right' },
  roomSubtitle: { color: '#92a9b1', flex: 1, textAlign: 'right' },
  roomTime: { color: '#71909a', fontSize: 12 },
  unreadBadge: { minWidth: 22, height: 22, borderRadius: 11, backgroundColor: '#00a884', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 6 },
  unreadBadgeText: { color: '#fff', fontWeight: '800', fontSize: 12 },
  emptyState: { alignItems: 'center', justifyContent: 'center', paddingHorizontal: 24, paddingVertical: 48 },
  emptyTitle: { color: '#f3fbff', fontWeight: '800', fontSize: 18, textAlign: 'center' },
  emptySubtitle: { color: '#88a0a8', textAlign: 'center', marginTop: 8, lineHeight: 22 },
  loadingFill: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  bottomNav: { flexDirection: 'row-reverse', backgroundColor: '#09171d', borderTopWidth: 1, borderColor: '#17303a', paddingHorizontal: 10, paddingVertical: 10, gap: 8 },
  navButton: { flex: 1, borderRadius: 14, paddingVertical: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: '#0f2028' },
  navButtonActive: { backgroundColor: '#00a884' },
  navButtonText: { color: '#8fa6ae', fontWeight: '800', fontSize: 12 },
  navButtonTextActive: { color: '#fff' },
  tabScroll: { paddingHorizontal: 16, paddingBottom: 100 },
  resultCard: { backgroundColor: '#0d1b22', borderRadius: 20, padding: 14, marginBottom: 10, flexDirection: 'row-reverse', alignItems: 'center', gap: 12, borderWidth: 1, borderColor: '#17303a' },
  resultName: { color: '#f4fbff', fontWeight: '800', fontSize: 16, textAlign: 'right' },
  resultMeta: { color: '#92a9b1', textAlign: 'right', marginTop: 4 },
  settingsCard: { backgroundColor: '#102028', borderRadius: 20, padding: 16, marginTop: 16, borderWidth: 1, borderColor: '#1c343f' },
  settingsTitle: { color: '#f3fbff', fontWeight: '800', fontSize: 18, textAlign: 'right' },
  settingsDesc: { color: '#86a0aa', textAlign: 'right', marginTop: 8, lineHeight: 21, marginBottom: 12 },
  chatHeader: { flexDirection: 'row-reverse', alignItems: 'center', gap: 10, paddingHorizontal: 14, paddingVertical: 12, borderBottomWidth: 1, borderColor: '#16323d', backgroundColor: '#0b171d' },
  backPill: { backgroundColor: '#102028', borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10, borderWidth: 1, borderColor: '#1f3945' },
  backPillText: { color: '#d7e5e9', fontWeight: '700' },
  chatTitle: { color: '#f3fbff', fontSize: 18, fontWeight: '800', textAlign: 'right' },
  chatSubtitle: { color: '#86a0aa', textAlign: 'right', marginTop: 4 },
  messagesList: { paddingHorizontal: 12, paddingVertical: 14, paddingBottom: 22 },
  messageWrap: { marginBottom: 10 },
  mineWrap: { alignItems: 'flex-start' },
  theirWrap: { alignItems: 'flex-end' },
  senderName: { color: '#8da5ad', fontSize: 12, marginBottom: 6, textAlign: 'right' },
  bubble: { maxWidth: '84%', borderRadius: 18, paddingHorizontal: 12, paddingVertical: 10, gap: 8 },
  myBubble: { backgroundColor: '#00a884', borderBottomLeftRadius: 6 },
  theirBubble: { backgroundColor: '#102028', borderBottomRightRadius: 6, borderWidth: 1, borderColor: '#1b3540' },
  bubbleText: { color: '#f7fbfd', fontSize: 15, lineHeight: 22, textAlign: 'right' },
  bubbleTime: { color: 'rgba(255,255,255,0.75)', fontSize: 11, textAlign: 'left' },
  composerWrap: { flexDirection: 'row-reverse', alignItems: 'flex-end', gap: 10, padding: 12, borderTopWidth: 1, borderColor: '#16323d', backgroundColor: '#0a151a' },
  attachButton: { backgroundColor: '#102028', borderWidth: 1, borderColor: '#1d3440', borderRadius: 14, paddingHorizontal: 12, paddingVertical: 14 },
  attachButtonText: { color: '#d7e5e9', fontWeight: '700' },
  attachmentMeta: { color: '#9bd4c5', marginTop: 6, textAlign: 'right', fontSize: 12 },
  composerInput: { flex: 1, minHeight: 52, maxHeight: 140, backgroundColor: '#102028', borderRadius: 18, paddingHorizontal: 14, paddingVertical: 14, color: '#f3fbff', textAlign: 'right' },
  sendButton: { backgroundColor: '#00a884', borderRadius: 18, paddingHorizontal: 18, paddingVertical: 16 },
  sendButtonText: { color: '#fff', fontWeight: '800' },
  callCard: { margin: 16, marginBottom: 8, backgroundColor: '#102028', borderRadius: 18, padding: 16, borderWidth: 1, borderColor: '#1d3440' },
  callStage: { color: '#f5fbfd', fontSize: 20, fontWeight: '800', textAlign: 'right' },
  callCardGroup: { borderColor: '#25424d', backgroundColor: '#11252e' },
  callHeroRow: { flexDirection: 'row-reverse', alignItems: 'flex-start', gap: 10, marginBottom: 8 },
  callHeroBadges: { flexDirection: 'row-reverse', gap: 8, flexWrap: 'wrap' },
  callHeroBadge: { backgroundColor: '#17323c', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999 },
  callHeroBadgeDanger: { backgroundColor: '#742a2a' },
  callHeroBadgeText: { color: '#e9fbff', fontWeight: '800', fontSize: 12 },
  reactionStrip: { flexDirection: 'row-reverse', gap: 8, marginTop: 8, marginBottom: 6 },
  reactionBubble: { backgroundColor: '#17323c', color: '#fff', fontSize: 22, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 16, overflow: 'hidden' },
  participantStrip: { paddingTop: 12, paddingBottom: 6, gap: 10 },
  participantCard: { width: 108, backgroundColor: '#10242d', borderWidth: 1, borderColor: '#1f404c', borderRadius: 18, padding: 10, alignItems: 'center', gap: 5 },
  participantCardPinned: { borderColor: '#00a884', backgroundColor: '#0e2e34' },
  participantName: { color: '#e7fbff', fontWeight: '700', fontSize: 13, textAlign: 'center' },
  participantRole: { color: '#8fb8c2', fontSize: 11 },
  participantHand: { fontSize: 16 },
  groupQuickActions: { flexDirection: 'row-reverse', flexWrap: 'wrap', gap: 8, marginTop: 10 },
  groupActionBtn: { backgroundColor: '#17323c', paddingHorizontal: 12, paddingVertical: 10, borderRadius: 14 },
  groupActionText: { color: '#f1feff', fontWeight: '700', fontSize: 12 },
  groupHint: { color: '#9fd0d8', marginTop: 8, textAlign: 'right' },
  callSenderName: { color: '#75c8b8', fontSize: 12, marginBottom: 4, fontWeight: '700' },
  callMeta: { color: '#86b7c3', fontSize: 12, textAlign: 'right', marginTop: 4 },
  callNotice: { color: '#a8bbc3', textAlign: 'right', marginTop: 8, lineHeight: 22 },
  callControlsRow: { flexDirection: 'row-reverse', gap: 10, marginTop: 14, flexWrap: 'wrap' },
  callControlButton: { flex: 1, minWidth: 140, backgroundColor: '#16313b', borderRadius: 14, paddingVertical: 12, paddingHorizontal: 12, borderWidth: 1, borderColor: '#214754' },
  callControlButtonOff: { backgroundColor: '#2b1d22', borderColor: '#5a2f39' },
  callControlButtonText: { color: '#f4fbfd', textAlign: 'center', fontWeight: '700' },
  callPreviewWrap: { flexDirection: 'row-reverse', gap: 10, marginTop: 14, marginBottom: 8 },
  callPreviewCard: { flex: 1, backgroundColor: '#0b171d', borderRadius: 16, borderWidth: 1, borderColor: '#1b3540', overflow: 'hidden' },
  previewLabel: { color: '#c8d8dd', fontWeight: '800', fontSize: 12, textAlign: 'right', paddingHorizontal: 10, paddingTop: 10 },
  callPreviewVideo: { width: '100%', height: 160, backgroundColor: '#081116' },
  callPreviewPlaceholder: { height: 160, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 12, backgroundColor: '#081116' },
  callPreviewText: { color: '#8fa6ae', textAlign: 'center', lineHeight: 21 },
  modalBackdrop: { flex: 1, backgroundColor: 'rgba(2,8,11,0.72)', justifyContent: 'flex-end', alignItems: 'center' },
  modalSheet: { backgroundColor: '#0d1b22', borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 18, gap: 12, borderTopWidth: 1, borderColor: '#1c343f', width: '100%' },
  modalTitle: { color: '#f4fbff', fontSize: 20, fontWeight: '800', textAlign: 'right' },
  modalDesc: { color: '#8fa6ae', textAlign: 'right', lineHeight: 21 },
  inlineRow: { flexDirection: 'row-reverse', gap: 10 },
  segmentRow: { flexDirection: 'row-reverse', gap: 10 },
  segment: { flex: 1, backgroundColor: '#112128', borderRadius: 14, paddingVertical: 12, alignItems: 'center', borderWidth: 1, borderColor: '#213743' },
  segmentActive: { backgroundColor: '#00a884', borderColor: '#00a884' },
  segmentText: { color: '#d8e5ea', fontWeight: '800' },
  segmentTextActive: { color: '#fff' },
  toggleRow: { flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'space-between', backgroundColor: '#112128', borderRadius: 16, paddingHorizontal: 14, paddingVertical: 14, borderWidth: 1, borderColor: '#213743' },
  toggleLabel: { color: '#d8e5ea', fontWeight: '700' },
  toggleBadge: { backgroundColor: '#223641', borderRadius: 12, paddingHorizontal: 12, paddingVertical: 6 },
  toggleBadgeActive: { backgroundColor: '#00a884' },
  toggleBadgeText: { color: '#fff', fontWeight: '800' },
  incomingCard: { backgroundColor: '#102028', borderRadius: 22, padding: 18, borderWidth: 1, borderColor: '#1d3440', width: '88%', marginBottom: 60 },
  infoPrimary: { color: '#f4fbff', fontSize: 19, fontWeight: '800', textAlign: 'right' },
  infoSecondary: { color: '#89a0a9', textAlign: 'right', marginTop: 6, lineHeight: 21 },
  infoGrid: { flexDirection: 'row-reverse', flexWrap: 'wrap', gap: 8, marginTop: 12, marginBottom: 10 },
  infoChip: { backgroundColor: '#112128', borderRadius: 999, paddingHorizontal: 12, paddingVertical: 8, borderWidth: 1, borderColor: '#213743' },
  infoChipOk: { borderColor: '#00a88455', backgroundColor: '#12342f' },
  infoChipText: { color: '#d8e5ea', fontWeight: '700' },
  webOverlay: { position: 'absolute', top: 76, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(7,18,23,0.35)', alignItems: 'center', justifyContent: 'center', zIndex: 10 },
});
