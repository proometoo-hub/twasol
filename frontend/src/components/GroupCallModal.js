import React, { useEffect, useMemo, useRef, useState } from 'react';
import { PhoneOff, Mic, MicOff, Video, VideoOff, Sparkles, Shield, Users, Wifi, Wand2, MonitorUp, Pin, PinOff, UserX, VolumeX, LayoutGrid, Gauge, Zap, Radar, Activity, Hand, SmilePlus, CircleDotDashed, Radio, Crown, UserCheck, BellRing } from 'lucide-react';
import Avatar from './Avatar';

import { RTC_CONFIGURATION, HAS_TURN_SERVER } from '../utils/webrtcConfig';

function applyEffect(video, effectMode, performanceMode = 'balanced') {
  if (!video) return;
  video.dataset.effectMode = effectMode || 'none';
  video.dataset.performanceMode = performanceMode;
  const blurValue = performanceMode === 'smooth' ? '5px' : performanceMode === 'sharp' ? '12px' : '8px';
  if (effectMode === 'blur') video.style.filter = `blur(${blurValue}) saturate(0.92)`;
  else if (effectMode === 'mask') video.style.filter = performanceMode === 'smooth' ? 'contrast(1.02) saturate(0.88)' : 'contrast(1.08) saturate(0.7) sepia(0.15)';
  else if (effectMode === 'glasses') video.style.filter = performanceMode === 'smooth' ? 'contrast(1.02)' : 'contrast(1.06) saturate(1.1)';
  else video.style.filter = '';
}

function getEffectiveEffectMode(mode, performanceMode, participantCount) {
  if (performanceMode === 'smooth' && participantCount >= 6 && mode === 'mask') return 'blur';
  return mode || 'none';
}

function replaceOutgoingVideoTrack(peersRef, stream) {
  const videoTrack = stream?.getVideoTracks?.()[0];
  Object.values(peersRef.current || {}).forEach(pc => {
    const sender = pc.getSenders().find(s => s.track && s.track.kind === 'video');
    if (sender && videoTrack) sender.replaceTrack(videoTrack).catch(() => {});
  });
}

async function attachMediaElementStream(element, stream, { muted = false } = {}) {
  if (!element) return;
  element.srcObject = stream || null;
  element.muted = muted;
  element.autoplay = true;
  element.playsInline = true;
  try {
    const playPromise = element.play?.();
    if (playPromise?.catch) await playPromise.catch(() => {});
  } catch {}
}

function buildTrackStream(event, fallbackRef, key) {
  if (event?.streams?.[0]) {
    fallbackRef.current[key] = event.streams[0];
    return event.streams[0];
  }
  const stream = fallbackRef.current[key] || new MediaStream();
  const track = event?.track;
  if (track && !stream.getTracks().some((item) => item.id === track.id)) stream.addTrack(track);
  fallbackRef.current[key] = stream;
  return stream;
}

export default function GroupCallModal({ socket, conversation, user, callType = 'video', incoming = false, onClose }) {
  const [status, setStatus] = useState(incoming ? 'incoming' : 'connecting');
  const [participants, setParticipants] = useState(() => {
    const list = conversation?.members?.map(m => m.user).filter(Boolean) || [];
    const uniq = []; const seen = new Set();
    for (const p of list) if (p && !seen.has(p.id)) { seen.add(p.id); uniq.push(p); }
    if (user && !seen.has(user.id)) uniq.unshift(user);
    return uniq;
  });
  const [presentIds, setPresentIds] = useState(() => new Set(user?.id ? [user.id] : []));
  const [effectMode, setEffectMode] = useState('none');
  const [remoteEffects, setRemoteEffects] = useState({});
  const [screenShares, setScreenShares] = useState({});
  const [muted, setMuted] = useState(false);
  const [videoOff, setVideoOff] = useState(callType !== 'video');
  const [sharingScreen, setSharingScreen] = useState(false);
  const [pinnedUserId, setPinnedUserId] = useState(null);
  const [connectionHint, setConnectionHint] = useState('جاري الربط بالغرفة');
  const [adminNotice, setAdminNotice] = useState('');
  const [layoutMode, setLayoutMode] = useState('auto');
  const [performanceMode, setPerformanceMode] = useState('balanced');
  const [autoFollowScreen, setAutoFollowScreen] = useState(true);
  const [speakerFocus, setSpeakerFocus] = useState(true);
  const [activeSpeakerId, setActiveSpeakerId] = useState(null);
  const [audioLevels, setAudioLevels] = useState({});
  const [raisedHands, setRaisedHands] = useState({});
  const [reactions, setReactions] = useState([]);
  const [recording, setRecording] = useState(false);
  const [recordingBy, setRecordingBy] = useState(null);
  const [waitingRoomEnabled, setWaitingRoomEnabled] = useState(false);
  const [pendingJoiners, setPendingJoiners] = useState([]);
  const [callRoles, setCallRoles] = useState({});
  const [muteAllActive, setMuteAllActive] = useState(false);
  const [waitingStatus, setWaitingStatus] = useState('idle');
  const [mediaNotice, setMediaNotice] = useState('');
  const [deviceSupport, setDeviceSupport] = useState({ audio: false, video: false });
  const [chatOpen, setChatOpen] = useState(true);
  const [callChat, setCallChat] = useState([]);
  const [callChatText, setCallChatText] = useState('');
  const callChatEndRef = useRef(null);
  const localVideoRef = useRef(null);
  const localStreamRef = useRef(null);
  const cameraStreamRef = useRef(null);
  const peersRef = useRef({});
  const pendingIceRef = useRef({});
  const remoteStreamsRef = useRef({});
  const audioAnalyzersRef = useRef({});
  const [, forceRender] = useState(0);

  const isAdmin = conversation?.members?.find(m => m.userId === user?.id)?.role === 'admin';
  const myRole = callRoles[user?.id] || (isAdmin ? 'host' : 'listener');
  const roleLabel = (role) => role === 'host' ? 'مضيف' : role === 'presenter' ? 'مقدّم' : 'مستمع';

  const isLikelySecureMediaContext = () => {
    if (typeof window === 'undefined') return true;
    const host = window.location.hostname;
    return window.isSecureContext || host === 'localhost' || host === '127.0.0.1';
  };

  const bindLocalPreview = (stream) => {
    localStreamRef.current = stream || new MediaStream();
    if (localVideoRef.current) {
      void attachMediaElementStream(localVideoRef.current, localStreamRef.current, { muted: true });
      applyEffect(localVideoRef.current, effectiveLocalEffect, performanceMode);
    }
    setDeviceSupport({
      audio: !!localStreamRef.current?.getAudioTracks?.().length,
      video: !!localStreamRef.current?.getVideoTracks?.().length,
    });
  };

  const describeMediaError = (err) => {
    const name = err?.name || '';
    if (!navigator?.mediaDevices?.getUserMedia) return 'المتصفح أو الصفحة الحالية لا يسمحان بالوصول للكاميرا والمايك.';
    if (!isLikelySecureMediaContext()) return 'المتصفح منع الوصول للكاميرا أو الميكروفون من هذا العنوان. سنكمل المكالمة بدون أجهزة محلية ويمكنكم المتابعة بالكتابة داخل المكالمة.';
    if (name === 'NotAllowedError' || name === 'SecurityError') return 'تم رفض إذن الكاميرا أو الميكروفون من المتصفح أو النظام.';
    if (name === 'NotFoundError' || name === 'DevicesNotFoundError') return 'لم يتم العثور على ميكروفون أو كاميرا متاحة.';
    if (name === 'NotReadableError' || name === 'TrackStartError') return 'الكاميرا أو الميكروفون مشغولان من برنامج آخر.';
    if (name === 'OverconstrainedError') return 'إعدادات الكاميرا أو الميكروفون غير مدعومة على هذا الجهاز.';
    return 'تعذر تجهيز الكاميرا أو الميكروفون، لكن يمكنك متابعة المكالمة بدون وسائط محلية.';
  };

  const requestUserMediaWithFallback = async (preferVideo = callType === 'video') => {
    if (!navigator?.mediaDevices?.getUserMedia) {
      bindLocalPreview(new MediaStream());
      setMediaNotice(describeMediaError());
      setConnectionHint('المكالمة مستمرة بدون كاميرا أو مايك محلي');
      return localStreamRef.current;
    }

    const tunedAudio = { echoCancellation: true, noiseSuppression: true, autoGainControl: true };
    const tunedVideo = { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 720 } };
    const attempts = preferVideo
      ? [
          { audio: tunedAudio, video: tunedVideo },
          { audio: tunedAudio, video: true },
          { audio: tunedAudio, video: false },
          { audio: false, video: tunedVideo },
        ]
      : [
          { audio: tunedAudio, video: false },
          { audio: false, video: false },
        ];

    let lastError = null;
    for (const constraints of attempts) {
      if (!constraints.audio && !constraints.video) continue;
      try {
        const stream = await navigator.mediaDevices.getUserMedia(constraints);
        stream.getTracks().forEach((track) => { track.enabled = true; });
        if (constraints.video) cameraStreamRef.current = stream;
        bindLocalPreview(stream);
        setMediaNotice('');
        setConnectionHint(
          constraints.audio && constraints.video
            ? 'تم تجهيز الكاميرا والمايك'
            : constraints.audio
              ? 'تم تجهيز الميكروفون فقط'
              : 'تم تجهيز الكاميرا فقط'
        );
        return stream;
      } catch (err) {
        lastError = err;
      }
    }

    bindLocalPreview(new MediaStream());
    setMediaNotice(describeMediaError(lastError));
    setConnectionHint('المكالمة مستمرة بدون كاميرا أو مايك محلي');
    return localStreamRef.current;
  };

  const ensureLocalTrack = async (kind) => {
    if (kind === 'audio' && localStreamRef.current?.getAudioTracks?.().length) return true;
    if (kind === 'video' && localStreamRef.current?.getVideoTracks?.().length) return true;
    if (!navigator?.mediaDevices?.getUserMedia) {
      setMediaNotice(describeMediaError());
      return false;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: kind === 'audio' ? { echoCancellation: true, noiseSuppression: true, autoGainControl: true } : false,
        video: kind === 'video' ? { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 720 } } : false
      });
      stream.getTracks().forEach((track) => { track.enabled = true; });
      const current = localStreamRef.current || new MediaStream();
      const merged = new MediaStream([
        ...current.getTracks().filter(t => t.kind !== kind),
        ...stream.getTracks(),
      ]);
      if (kind === 'video') cameraStreamRef.current = stream;
      bindLocalPreview(merged);
      stream.getTracks().forEach(track => {
        Object.values(peersRef.current || {}).forEach(pc => {
          const sender = pc.getSenders().find(s => (s.track && s.track.kind === track.kind) || (!s.track && s.transport));
          if (sender && (sender.track?.kind === track.kind || sender.track == null)) sender.replaceTrack(track).catch(() => {});
          else pc.addTrack(track, merged);
        });
      });
      setMediaNotice('');
      return true;
    } catch (err) {
      setMediaNotice(describeMediaError(err));
      return false;
    }
  };

  const remoteTiles = useMemo(() => Array.from(presentIds).filter(id => id !== user?.id).map(id => ({
    user: participants.find(p => p.id === id) || { id, name: `User ${id}` },
    stream: remoteStreamsRef.current[id] || null,
    effectMode: remoteEffects[id] || 'none',
    isScreenSharing: !!screenShares[id]
  })), [participants, presentIds, user?.id, remoteEffects, screenShares]);

  const totalPresent = presentIds.size || 1;
  const effectiveLocalEffect = getEffectiveEffectMode(effectMode, performanceMode, totalPresent);
  const loadHint = totalPresent >= 8 ? 'مرتفع' : totalPresent >= 5 ? 'متوسط' : 'خفيف';

  const featuredTile = useMemo(() => {
    if (pinnedUserId && pinnedUserId !== user?.id) return remoteTiles.find(t => t.user.id === pinnedUserId) || null;
    if (pinnedUserId === user?.id) return { user, stream: localStreamRef.current, effectMode, isScreenSharing: sharingScreen };
    if (speakerFocus && activeSpeakerId && activeSpeakerId !== user?.id) return remoteTiles.find(t => t.user.id === activeSpeakerId) || null;
    if (speakerFocus && activeSpeakerId === user?.id) return { user, stream: localStreamRef.current, effectMode, isScreenSharing: sharingScreen };
    return remoteTiles.find(t => t.isScreenSharing) || null;
  }, [pinnedUserId, remoteTiles, user, effectMode, sharingScreen, speakerFocus, activeSpeakerId]);

  useEffect(() => {
    let mounted = true;
    const ensureMedia = async () => {
      const stream = await requestUserMediaWithFallback(callType === 'video');
      if (!mounted) return stream;
      if (incoming && !mediaNotice) setConnectionHint('مكالمة جماعية واردة');
      return stream;
    };

    const flushPeerIce = async (targetUserId) => {
      const pc = peersRef.current[targetUserId];
      const queue = pendingIceRef.current[targetUserId] || [];
      if (!pc?.remoteDescription || !queue.length) return;
      pendingIceRef.current[targetUserId] = [];
      for (const candidate of queue) {
        try { await pc.addIceCandidate(new RTCIceCandidate(candidate)); } catch (err) { console.warn('group buffered ICE failed', err); }
      }
    };

    const queueOrApplyPeerIce = async (targetUserId, candidate) => {
      if (!candidate) return;
      const pc = peersRef.current[targetUserId];
      if (!pc || !pc.remoteDescription) {
        pendingIceRef.current[targetUserId] = [...(pendingIceRef.current[targetUserId] || []), candidate];
        return;
      }
      try { await pc.addIceCandidate(new RTCIceCandidate(candidate)); }
      catch (err) {
        pendingIceRef.current[targetUserId] = [...(pendingIceRef.current[targetUserId] || []), candidate];
      }
    };

    const createPeer = async (targetUserId, makeOffer = true) => {
      if (peersRef.current[targetUserId]) return peersRef.current[targetUserId];
      const pc = new RTCPeerConnection(RTC_CONFIGURATION);
      peersRef.current[targetUserId] = pc;
      pendingIceRef.current[targetUserId] = pendingIceRef.current[targetUserId] || [];
      const localTracks = localStreamRef.current?.getTracks?.() || [];
      const audioTrack = localTracks.find(track => track.kind === 'audio');
      const videoTrack = localTracks.find(track => track.kind === 'video');
      if (audioTrack) { audioTrack.enabled = true; pc.addTrack(audioTrack, localStreamRef.current); }
      else pc.addTransceiver('audio', { direction: 'recvonly' });
      if (videoTrack) { videoTrack.enabled = true; pc.addTrack(videoTrack, localStreamRef.current); }
      else pc.addTransceiver('video', { direction: 'recvonly' });
      pc.onicecandidate = (e) => { if (e.candidate) socket.emit('group_call_ice', { conversationId: conversation.id, targetUserId, candidate: e.candidate }); };
      pc.ontrack = (e) => {
        remoteStreamsRef.current[targetUserId] = buildTrackStream(e, remoteStreamsRef, targetUserId);
        setPresentIds(prev => new Set([...Array.from(prev), targetUserId]));
        forceRender(v => v + 1);
      };
      pc.onconnectionstatechange = () => {
        const s = pc.connectionState;
        if (s === 'connected') setConnectionHint('الاتصال الجماعي مستقر');
        else if (s === 'connecting') setConnectionHint('جاري ربط الأعضاء');
      };
      if (makeOffer) {
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        socket.emit('group_call_offer', { conversationId: conversation.id, targetUserId, signal: offer, callType, effectMode });
      }
      return pc;
    };

    const boot = async () => {
      await ensureMedia();
      if (!incoming) {
        socket.emit('group_call_start', { conversationId: conversation.id, callType, effectMode });
        socket.emit('join_group_call', { conversationId: conversation.id, callType, effectMode });
        setStatus('connecting');
      }
    };

    boot().catch((err) => {
      bindLocalPreview(new MediaStream());
      setMediaNotice(describeMediaError(err));
      if (!incoming) {
        socket.emit('group_call_start', { conversationId: conversation.id, callType, effectMode });
        socket.emit('join_group_call', { conversationId: conversation.id, callType, effectMode });
        setStatus('connecting');
      }
      setConnectionHint('المكالمة مستمرة بدون كاميرا أو مايك محلي');
    });

    const onParticipantJoined = async ({ conversationId, participant }) => {
      if (conversationId !== conversation.id || !participant?.userId || participant.userId === user?.id) return;
      setPresentIds(prev => new Set([...Array.from(prev), participant.userId]));
      if (!participants.find(p => p.id === participant.userId)) {
        const member = conversation.members?.find(m => m.userId === participant.userId)?.user;
        if (member) setParticipants(prev => [...prev, member]);
      }
      await createPeer(participant.userId, true);
    };
    const onParticipantLeft = ({ conversationId, userId: leftId }) => {
      if (conversationId !== conversation.id) return;
      setPresentIds(prev => new Set(Array.from(prev).filter(v => v !== leftId)));
      if (peersRef.current[leftId]) { peersRef.current[leftId].close(); delete peersRef.current[leftId]; }
      delete pendingIceRef.current[leftId];
      delete remoteStreamsRef.current[leftId];
      forceRender(v => v + 1);
    };
    const onOffer = async ({ conversationId, callerId, signal, effectMode: remoteEffect }) => {
      if (conversationId !== conversation.id || callerId === user?.id) return;
      const pc = await createPeer(callerId, false);
      await pc.setRemoteDescription(new RTCSessionDescription(signal));
      await flushPeerIce(callerId);
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      socket.emit('group_call_answer', { conversationId: conversation.id, targetUserId: callerId, signal: answer });
      setPresentIds(prev => new Set([...Array.from(prev), callerId]));
      setRemoteEffects(prev => ({ ...prev, [callerId]: remoteEffect || 'none' }));
      setStatus('connected');
    };
    const onAnswer = async ({ conversationId, userId: remoteId, signal }) => {
      if (conversationId !== conversation.id || !peersRef.current[remoteId]) return;
      await peersRef.current[remoteId].setRemoteDescription(new RTCSessionDescription(signal));
      await flushPeerIce(remoteId);
      setPresentIds(prev => new Set([...Array.from(prev), remoteId]));
    };
    const onIce = async ({ conversationId, userId: remoteId, candidate }) => {
      if (conversationId !== conversation.id) return;
      await queueOrApplyPeerIce(remoteId, candidate);
    };
    const onEffect = ({ conversationId, userId: remoteId, effectMode }) => {
      if (conversationId !== conversation.id) return;
      setRemoteEffects(prev => ({ ...prev, [remoteId]: effectMode || 'none' }));
    };
    const onIncoming = ({ conversationId, members }) => {
      if (conversationId !== conversation.id || !incoming) return;
      if (Array.isArray(members) && members.length) setParticipants(prev => {
        const map = new Map(prev.map(p => [p.id, p]));
        members.forEach(m => map.set(m.id, m));
        return Array.from(map.values());
      });
    };
    const onScreenShare = ({ conversationId, userId: remoteId, enabled }) => {
      if (conversationId !== conversation.id) return;
      setScreenShares(prev => ({ ...prev, [remoteId]: !!enabled }));
      if (enabled && autoFollowScreen && !pinnedUserId) setPinnedUserId(remoteId);
      if (!enabled && pinnedUserId === remoteId && autoFollowScreen) setPinnedUserId(null);
    };
    const onAdminAction = ({ conversationId, actorUserId, targetUserId, action }) => {
      if (conversationId !== conversation.id) return;
      const actor = participants.find(p => p.id === actorUserId)?.name || 'الإدارة';
      const target = participants.find(p => p.id === targetUserId)?.name || 'عضو';
      if (action === 'mute') setAdminNotice(`${actor} طلب كتم ${target}`);
      if (action === 'remove') setAdminNotice(`${actor} أزال ${target} من المكالمة`);
      setTimeout(() => setAdminNotice(''), 3500);
    };
    const onForceLeave = ({ conversationId }) => {
      if (conversationId !== conversation.id) return;
      setAdminNotice('تمت إزالتك من المكالمة بواسطة الإدارة');
      setTimeout(() => onClose?.(), 1200);
    };
    const onRaiseHand = ({ conversationId, userId: remoteId, raised }) => {
      if (conversationId !== conversation.id) return;
      setRaisedHands(prev => ({ ...prev, [remoteId]: !!raised }));
    };
    const onReaction = ({ conversationId, userId: remoteId, reaction }) => {
      if (conversationId !== conversation.id) return;
      const actor = participants.find(p => p.id === remoteId)?.name || 'عضو';
      const id = `${remoteId}-${Date.now()}-${Math.random().toString(36).slice(2,6)}`;
      setReactions(prev => [...prev, { id, userId: remoteId, reaction: reaction || '👍', name: actor }]);
      setTimeout(() => setReactions(prev => prev.filter(item => item.id !== id)), 2800);
    };
    const onRecording = ({ conversationId, userId: remoteId, enabled }) => {
      if (conversationId !== conversation.id) return;
      setRecording(!!enabled);
      setRecordingBy(enabled ? remoteId : null);
      if (enabled) {
        const actor = participants.find(p => p.id === remoteId)?.name || 'الإدارة';
        setAdminNotice(`بدأ ${actor} تسجيل المكالمة`);
      } else {
        setAdminNotice('تم إيقاف تسجيل المكالمة');
      }
      setTimeout(() => setAdminNotice(''), 3000);
    };

    const onCallState = ({ conversationId, waitingRoom, muteAll, roles, pending }) => {
      if (conversationId !== conversation.id) return;
      setWaitingRoomEnabled(!!waitingRoom);
      setMuteAllActive(!!muteAll);
      if (roles) setCallRoles(roles);
      if (pending) setPendingJoiners(pending);
    };
    const onPendingJoiners = ({ conversationId, pending }) => {
      if (conversationId !== conversation.id) return;
      setPendingJoiners(Array.isArray(pending) ? pending : []);
    };
    const onWaitingRoom = ({ conversationId, status }) => {
      if (conversationId !== conversation.id) return;
      setWaitingStatus(status || 'pending');
      if (status === 'admitted') {
        setWaitingStatus('admitted');
        socket.emit('join_group_call', { conversationId: conversation.id, callType, effectMode });
        setStatus('connected');
      }
      if (status === 'rejected') {
        setAdminNotice('تم رفض طلب انضمامك إلى المكالمة');
      }
    };
    const onMuteAll = ({ conversationId, enabled, actorUserId }) => {
      if (conversationId !== conversation.id) return;
      setMuteAllActive(!!enabled);
      if (enabled && actorUserId !== user?.id) {
        const track = localStreamRef.current?.getAudioTracks?.()[0];
        if (track) track.enabled = false;
        setMuted(true);
        setAdminNotice('تم كتم الجميع بواسطة الإدارة');
      } else if (!enabled) {
        setAdminNotice('تم إلغاء كتم الجميع');
      }
      setTimeout(() => setAdminNotice(''), 2500);
    };
    const onRoleUpdated = ({ conversationId, role }) => {
      if (conversationId !== conversation.id) return;
      setCallRoles(prev => ({ ...prev, [user?.id]: role }));
      setAdminNotice(`تم تحديث دورك إلى ${roleLabel(role)}`);
      setTimeout(() => setAdminNotice(''), 2500);
    };
    const onCallChatMessage = ({ conversationId, message }) => {
      if (conversationId !== conversation.id || !message?.text) return;
      setCallChat(prev => {
        const exists = prev.some(item => (message.clientId && item.clientId === message.clientId) || item.id === message.id);
        if (exists) return prev.map(item => (message.clientId && item.clientId === message.clientId) ? { ...item, ...message } : item);
        return [...prev.slice(-79), message];
      });
    };

    socket.on('group_call_participant_joined', onParticipantJoined);
    socket.on('group_call_participant_left', onParticipantLeft);
    socket.on('group_call_offer', onOffer);
    socket.on('group_call_answer', onAnswer);
    socket.on('group_call_ice', onIce);
    socket.on('group_call_effect', onEffect);
    socket.on('incoming_group_call', onIncoming);
    socket.on('group_call_screen_share', onScreenShare);
    socket.on('group_call_admin_action', onAdminAction);
    socket.on('group_call_force_leave', onForceLeave);
    socket.on('group_call_raise_hand', onRaiseHand);
    socket.on('group_call_reaction', onReaction);
    socket.on('group_call_recording', onRecording);
    socket.on('group_call_state', onCallState);
    socket.on('group_call_pending_joiners', onPendingJoiners);
    socket.on('group_call_waiting_room', onWaitingRoom);
    socket.on('group_call_mute_all', onMuteAll);
    socket.on('group_call_role_updated', onRoleUpdated);
    socket.on('group_call_chat_message', onCallChatMessage);

    return () => {
      mounted = false;
      socket.off('group_call_participant_joined', onParticipantJoined);
      socket.off('group_call_participant_left', onParticipantLeft);
      socket.off('group_call_offer', onOffer);
      socket.off('group_call_answer', onAnswer);
      socket.off('group_call_ice', onIce);
      socket.off('group_call_effect', onEffect);
      socket.off('incoming_group_call', onIncoming);
      socket.off('group_call_screen_share', onScreenShare);
      socket.off('group_call_admin_action', onAdminAction);
      socket.off('group_call_force_leave', onForceLeave);
      socket.off('group_call_raise_hand', onRaiseHand);
      socket.off('group_call_reaction', onReaction);
      socket.off('group_call_recording', onRecording);
      socket.off('group_call_state', onCallState);
      socket.off('group_call_pending_joiners', onPendingJoiners);
      socket.off('group_call_waiting_room', onWaitingRoom);
      socket.off('group_call_mute_all', onMuteAll);
      socket.off('group_call_role_updated', onRoleUpdated);
      socket.off('group_call_chat_message', onCallChatMessage);
      try { socket.emit('group_call_leave', { conversationId: conversation.id }); } catch {}
      Object.values(peersRef.current).forEach(pc => { try { pc.close(); } catch {} });
      if (localStreamRef.current) localStreamRef.current.getTracks().forEach(t => t.stop());
      if (cameraStreamRef.current && cameraStreamRef.current !== localStreamRef.current) cameraStreamRef.current.getTracks().forEach(t => t.stop());
    };
  }, []);

  useEffect(() => {
    if (localVideoRef.current) applyEffect(localVideoRef.current, effectiveLocalEffect, performanceMode);
    if (socket && conversation?.id) socket.emit('group_call_effect', { conversationId: conversation.id, effectMode: effectiveLocalEffect });
  }, [effectiveLocalEffect, performanceMode, socket, conversation?.id]);

  useEffect(() => {
    callChatEndRef.current?.scrollIntoView({ block: 'end' });
  }, [callChat, chatOpen]);

  useEffect(() => {
    if (typeof window === 'undefined' || typeof AudioContext === 'undefined') return;
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    let disposed = false;
    const cleanupAnalyzers = () => {
      Object.values(audioAnalyzersRef.current).forEach(item => {
        try { item.source.disconnect(); } catch {}
        try { item.analyser.disconnect(); } catch {}
      });
      audioAnalyzersRef.current = {};
    };
    const ensureAnalyzer = (id, stream) => {
      if (!id || !stream || audioAnalyzersRef.current[id]) return;
      try {
        const source = ctx.createMediaStreamSource(stream);
        const analyser = ctx.createAnalyser();
        analyser.fftSize = 256;
        analyser.smoothingTimeConstant = 0.75;
        source.connect(analyser);
        audioAnalyzersRef.current[id] = { source, analyser, buffer: new Uint8Array(analyser.frequencyBinCount) };
      } catch {}
    };

    const tick = () => {
      if (disposed) return;
      ensureAnalyzer(user?.id || 'self', localStreamRef.current);
      Object.entries(remoteStreamsRef.current || {}).forEach(([id, stream]) => ensureAnalyzer(id, stream));
      const nextLevels = {};
      let leader = null;
      let best = 0;
      Object.entries(audioAnalyzersRef.current).forEach(([id, item]) => {
        try {
          item.analyser.getByteFrequencyData(item.buffer);
          const avg = item.buffer.reduce((sum, value) => sum + value, 0) / Math.max(item.buffer.length, 1);
          const normalized = Math.max(0, Math.min(100, Math.round((avg / 255) * 100)));
          nextLevels[id] = normalized;
          if (normalized > best) {
            best = normalized;
            leader = id;
          }
        } catch {}
      });
      setAudioLevels(prev => {
        const prevKeys = Object.keys(prev || {});
        const nextKeys = Object.keys(nextLevels);
        if (prevKeys.length === nextKeys.length && nextKeys.every(k => prev[k] === nextLevels[k])) return prev;
        return nextLevels;
      });
      setActiveSpeakerId(best >= 12 ? leader : null);
    };

    const interval = setInterval(tick, 700);
    return () => {
      disposed = true;
      clearInterval(interval);
      cleanupAnalyzers();
      try { ctx.close(); } catch {}
    };
  }, [presentIds, user?.id, speakerFocus]);

  const acceptIncoming = () => {
    setWaitingStatus('joining');
    socket.emit('join_group_call', { conversationId: conversation.id, callType, effectMode });
    setStatus('connected');
    setConnectionHint(waitingRoomEnabled && !isAdmin ? 'تم إرسال طلب الانضمام' : 'تم الانضمام للمكالمة الجماعية');
  };

  const leave = () => { try { socket.emit('group_call_leave', { conversationId: conversation.id }); } catch {} onClose?.(); };
  const layoutClass = `layout-${layoutMode === 'auto' ? (totalPresent >= 7 ? 'dense' : totalPresent >= 4 ? 'grid' : 'focus') : layoutMode}`;
  const clearPinned = () => setPinnedUserId(null);
  const toggleMute = async () => {
    let track = localStreamRef.current?.getAudioTracks?.()[0];
    if (!track) {
      const ok = await ensureLocalTrack('audio');
      if (!ok) return;
      track = localStreamRef.current?.getAudioTracks?.()[0];
    }
    if (!track) return;
    track.enabled = !track.enabled;
    setMuted(!track.enabled);
  };
  const toggleVideo = async () => {
    let track = localStreamRef.current?.getVideoTracks?.()[0];
    if (!track) {
      const ok = await ensureLocalTrack('video');
      if (!ok) return;
      track = localStreamRef.current?.getVideoTracks?.()[0];
    }
    if (!track) return;
    track.enabled = !track.enabled;
    setVideoOff(!track.enabled);
  };
  const toggleScreenShare = async () => {
    try {
      if (sharingScreen) {
        const camera = cameraStreamRef.current || (await requestUserMediaWithFallback(true));
        const audioTrack = localStreamRef.current?.getAudioTracks?.()[0];
        const next = new MediaStream([...(camera.getVideoTracks?.() || []), ...(audioTrack ? [audioTrack] : [])]);
        localStreamRef.current = next;
        void attachMediaElementStream(localVideoRef.current, next, { muted: true });
        replaceOutgoingVideoTrack(peersRef, next);
        setSharingScreen(false);
        socket.emit('group_call_screen_share', { conversationId: conversation.id, enabled: false });
        return;
      }
      const display = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: false });
      const videoTrack = display.getVideoTracks?.()[0];
      if (!videoTrack) return;
      const audioTrack = localStreamRef.current?.getAudioTracks?.()[0];
      const next = new MediaStream([videoTrack, ...(audioTrack ? [audioTrack] : [])]);
      localStreamRef.current = next;
      void attachMediaElementStream(localVideoRef.current, next, { muted: true });
      replaceOutgoingVideoTrack(peersRef, next);
      setSharingScreen(true);
      setPinnedUserId(user?.id);
      socket.emit('group_call_screen_share', { conversationId: conversation.id, enabled: true });
      videoTrack.onended = () => {
        setSharingScreen(false);
        socket.emit('group_call_screen_share', { conversationId: conversation.id, enabled: false });
      };
    } catch {}
  };

  const runAdminAction = (targetUserId, action) => {
    if (!isAdmin || !targetUserId || targetUserId === user?.id) return;
    socket.emit('group_call_admin_action', { conversationId: conversation.id, targetUserId, action });
  };

  const toggleRaisedHand = () => {
    const next = !raisedHands[user?.id];
    setRaisedHands(prev => ({ ...prev, [user?.id]: next }));
    socket.emit('group_call_raise_hand', { conversationId: conversation.id, raised: next });
  };

  const sendReaction = (reaction) => {
    const id = `${user?.id}-${Date.now()}-${Math.random().toString(36).slice(2,6)}`;
    setReactions(prev => [...prev, { id, userId: user?.id, reaction, name: user?.name || 'أنا' }]);
    setTimeout(() => setReactions(prev => prev.filter(item => item.id !== id)), 2800);
    socket.emit('group_call_reaction', { conversationId: conversation.id, reaction });
  };

  const toggleRecording = () => {
    if (!isAdmin) return;
    const next = !recording;
    setRecording(next);
    setRecordingBy(next ? user?.id : null);
    socket.emit('group_call_recording', { conversationId: conversation.id, enabled: next });
  };


  const toggleWaitingRoom = () => {
    if (!isAdmin) return;
    socket.emit('group_call_toggle_waiting_room', { conversationId: conversation.id, enabled: !waitingRoomEnabled });
    setWaitingRoomEnabled(v => !v);
  };

  const toggleMuteAll = () => {
    if (!isAdmin) return;
    socket.emit('group_call_mute_all', { conversationId: conversation.id, enabled: !muteAllActive });
    setMuteAllActive(v => !v);
  };

  const admitJoiner = (targetUserId, admit = true) => {
    if (!isAdmin) return;
    socket.emit('group_call_admit_joiner', { conversationId: conversation.id, targetUserId, admit });
    if (!admit) setPendingJoiners(prev => prev.filter(p => p.userId !== targetUserId));
  };

  const setParticipantRole = (targetUserId, role) => {
    if (!isAdmin || !targetUserId) return;
    socket.emit('group_call_set_role', { conversationId: conversation.id, targetUserId, role });
    setCallRoles(prev => ({ ...prev, [targetUserId]: role }));
  };

  const sendCallChat = () => {
    const trimmed = callChatText.trim();
    if (!trimmed) return;
    const optimistic = {
      id: `local-${Date.now()}`,
      clientId: `local-${Date.now()}`,
      userId: user?.id,
      text: trimmed,
      createdAt: new Date().toISOString(),
    };
    setCallChat(prev => [...prev.slice(-79), optimistic]);
    setCallChatText('');
    socket.emit('group_call_chat_message', { conversationId: conversation.id, text: trimmed, clientId: optimistic.clientId });
  };

  return (
    <div className="call-overlay group-call-overlay">
      <div className="group-call-shell">
        <div className="group-call-header">
          <div>
            <div className="call-name" style={{ marginBottom: 6 }}>{conversation?.name || 'مكالمة جماعية'}</div>
            <div className="call-status"><Users size={14} /> {Array.from(presentIds).length} مشارك • {connectionHint}</div>
            <div className="group-call-substatus">{sharingScreen ? 'تتم الآن مشاركة شاشة داخل الغرفة' : 'يمكنك تثبيت أي مشارك أو التحويل إلى عرض شبكة'}{waitingRoomEnabled ? ' • غرفة الانتظار مفعلة' : ''}{muteAllActive ? ' • كتم الجميع مفعل' : ''}</div>
            {mediaNotice && <div className="group-call-warning">{mediaNotice}</div>}
            {adminNotice && <div className="group-call-notice">{adminNotice}</div>}
          </div>
          <div className="group-call-badges">
            <span className="live-pill ok"><Wifi size={13} /> {callType === 'video' ? 'فيديو جماعي' : 'صوت جماعي'}</span>
            <span className="live-pill"><Shield size={13} /> {effectMode === 'none' ? 'بدون إخفاء' : 'وضع خصوصية'}</span>
            {sharingScreen && <span className="live-pill ok"><MonitorUp size={13} /> مشاركة شاشة</span>}
            <button className={`live-pill live-pill-button ${chatOpen ? 'ok' : ''}`} onClick={() => setChatOpen(v => !v)}><Radio size={13} /> {chatOpen ? 'إخفاء دردشة المكالمة' : 'إظهار دردشة المكالمة'}</button>
            <span className="live-pill"><Gauge size={13} /> حمل الغرفة: {loadHint}</span>
            {recording && <span className="live-pill bad"><Radio size={13} /> يتم التسجيل{recordingBy ? ` • ${recordingBy === user?.id ? 'بواسطتك' : 'من أحد المشرفين'}` : ''}</span>}
            <span className={`live-pill ${performanceMode === 'smooth' ? 'ok' : ''}`}><Zap size={13} /> {performanceMode === 'smooth' ? 'وضع خفيف' : performanceMode === 'sharp' ? 'وضع أوضح' : 'وضع متوازن'}</span>
            <span className={`live-pill ${waitingRoomEnabled ? 'ok' : ''}`}><BellRing size={13} /> {waitingRoomEnabled ? 'غرفة انتظار' : 'دخول مباشر'}</span>
            <span className={`live-pill ${muteAllActive ? 'bad' : ''}`}><MicOff size={13} /> {muteAllActive ? 'كتم الجميع' : 'الميكروفونات حرة'}</span>
            <span className={`live-pill ${deviceSupport.audio ? 'ok' : 'warn'}`}><Mic size={13} /> {deviceSupport.audio ? 'مايك جاهز' : 'بدون مايك'}</span>
            <span className={`live-pill ${deviceSupport.video ? 'ok' : 'warn'}`}><Video size={13} /> {deviceSupport.video ? 'كاميرا جاهزة' : 'بدون كاميرا'}</span>
            <span className="live-pill"><LayoutGrid size={13} /> {layoutMode === 'auto' ? 'عرض تلقائي' : layoutMode === 'focus' ? 'عرض تركيز' : layoutMode === 'grid' ? 'شبكة' : 'شبكة كثيفة'}</span>
          </div>
        </div>

        {featuredTile && (
          <div className="group-call-featured">
            <div className="group-call-featured-head"><Pin size={14} /> عرض مثبت <button className="mini-icon-btn" onClick={clearPinned} title="إلغاء التثبيت"><PinOff size={12} /></button></div>
            <div className="group-call-tile featured">
              {featuredTile.stream ? <RemoteVideoTile stream={featuredTile.stream} effectMode={getEffectiveEffectMode(featuredTile.effectMode, performanceMode, totalPresent)} performanceMode={performanceMode} totalPresent={totalPresent} /> : <div className="group-call-audio-only"><Avatar user={featuredTile.user} size={84} /></div>}
              <div className="group-call-meta"><Avatar user={featuredTile.user} size={26} /><span>{featuredTile.user?.name}</span><span className="badge-chip badge-chip-blue">{roleLabel(callRoles[featuredTile.user?.id] || 'listener')}</span>{activeSpeakerId === featuredTile.user?.id && <span className="badge-chip badge-chip-green">يتحدث الآن</span>}{featuredTile.isScreenSharing && <span className="badge-chip">شاشة</span>}</div>
            </div>
          </div>
        )}

        <div className="group-call-reactions-layer">{reactions.map(item => <div key={item.id} className="group-call-reaction-bubble" title={item.name}>{item.reaction}</div>)}</div>

        <div className={`group-call-grid ${layoutClass}`}>
          <div className={`group-call-tile ${pinnedUserId === user?.id ? 'is-pinned' : ''} ${activeSpeakerId === user?.id ? 'is-speaking' : ''}`} onClick={() => setPinnedUserId(user?.id)}>
            <video ref={localVideoRef} autoPlay muted playsInline className={`group-call-video effect-${effectiveLocalEffect}`} />
            {effectiveLocalEffect === 'glasses' && performanceMode !== 'smooth' && <div className="video-effect-overlay">🕶️</div>}
            {effectiveLocalEffect === 'mask' && performanceMode !== 'smooth' && <div className="video-effect-overlay">🎭</div>}
            <div className="group-call-meta"><Avatar user={user} size={26} /><span>{user?.name || 'أنا'}</span><span className="badge-chip badge-chip-blue">{roleLabel(myRole)}</span>{raisedHands[user?.id] && <span className="badge-chip badge-chip-gold">رفع يده</span>}{activeSpeakerId === user?.id && <span className="badge-chip badge-chip-green">يتحدث الآن</span>}<AudioLevel level={audioLevels[user?.id] || audioLevels['self'] || 0} />{sharingScreen && <span className="badge-chip">شاشة</span>}</div>
          </div>

          {remoteTiles.map(tile => (
            <div key={tile.user.id} className={`group-call-tile ${pinnedUserId === tile.user.id ? 'is-pinned' : ''} ${activeSpeakerId === tile.user.id ? 'is-speaking' : ''}`} onClick={() => setPinnedUserId(tile.user.id)}>
              {tile.stream ? <RemoteVideoTile stream={tile.stream} effectMode={getEffectiveEffectMode(tile.effectMode, performanceMode, totalPresent)} performanceMode={performanceMode} totalPresent={totalPresent} /> : <div className="group-call-audio-only"><Avatar user={tile.user} size={72} /></div>}
              <div className="group-call-meta">
                <Avatar user={tile.user} size={26} />
                <span>{tile.user?.name}</span>
                <span className="badge-chip badge-chip-blue">{roleLabel(callRoles[tile.user.id] || 'listener')}</span>
                {raisedHands[tile.user.id] && <span className="badge-chip badge-chip-gold">رفع يده</span>}
                {activeSpeakerId === tile.user.id && <span className="badge-chip badge-chip-green">يتحدث الآن</span>}
                <AudioLevel level={audioLevels[tile.user.id] || 0} />
                {tile.isScreenSharing && <span className="badge-chip">شاشة</span>}
                {isAdmin && tile.user.id !== user?.id && (
                  <div className="group-call-admin-tools" onClick={(e) => e.stopPropagation()}>
                    <button className="mini-icon-btn" title="طلب كتم" onClick={() => runAdminAction(tile.user.id, 'mute')}><VolumeX size={13} /></button>
                    <button className="mini-icon-btn" title="تعيين كمقدّم" onClick={() => setParticipantRole(tile.user.id, 'presenter')}><UserCheck size={13} /></button>
                    <button className="mini-icon-btn" title="تعيين كمستمع" onClick={() => setParticipantRole(tile.user.id, 'listener')}><Crown size={13} /></button>
                    <button className="mini-icon-btn danger" title="إزالة من المكالمة" onClick={() => runAdminAction(tile.user.id, 'remove')}><UserX size={13} /></button>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>

        <div className={`group-call-body ${chatOpen ? 'with-chat' : ''}`}>
          <div className="group-call-main-stack">
            {waitingStatus === 'pending' && <div className="group-call-notice">تم إرسال طلب انضمامك وتنتظر موافقة الإدارة.</div>}

            {status === 'incoming' && (
              <div className="incoming-actions">
                <button className="btn btn-primary" onClick={acceptIncoming}>{waitingRoomEnabled && !isAdmin ? 'طلب انضمام' : 'انضمام الآن'}</button>
                <button className="btn" onClick={leave}>رفض</button>
              </div>
            )}

            <div className="group-call-toolbar">
              <div className="group-call-layout-switch">
                <button className={`mini-icon-btn ${layoutMode === 'auto' ? 'active' : ''}`} title="عرض تلقائي" onClick={() => setLayoutMode('auto')}><LayoutGrid size={14} /></button>
                <button className={`mini-icon-btn ${layoutMode === 'focus' ? 'active' : ''}`} title="تركيز" onClick={() => setLayoutMode('focus')}><Pin size={14} /></button>
                <button className={`mini-icon-btn ${layoutMode === 'grid' ? 'active' : ''}`} title="شبكة" onClick={() => setLayoutMode('grid')}><LayoutGrid size={14} /></button>
                <button className={`mini-icon-btn ${layoutMode === 'dense' ? 'active' : ''}`} title="شبكة كثيفة" onClick={() => setLayoutMode('dense')}><Users size={14} /></button>
              </div>
              <button className={`call-btn ${muted ? 'muted' : ''}`} onClick={toggleMute}>{muted ? <MicOff size={20} /> : <Mic size={20} />}</button>
              <button className={`call-btn ${videoOff ? 'muted' : ''}`} onClick={toggleVideo}>{videoOff ? <VideoOff size={20} /> : <Video size={20} />}</button>
              <button className={`call-btn ${sharingScreen ? 'active' : ''}`} onClick={toggleScreenShare}><MonitorUp size={20} /></button>
              <button className={`call-btn ${raisedHands[user?.id] ? 'active' : ''}`} onClick={toggleRaisedHand} title="رفع اليد"><Hand size={20} /></button>
              {isAdmin && <button className={`call-btn ${waitingRoomEnabled ? 'active' : ''}`} onClick={toggleWaitingRoom} title="غرفة الانتظار"><BellRing size={20} /></button>}
              {isAdmin && <button className={`call-btn ${muteAllActive ? 'muted' : ''}`} onClick={toggleMuteAll} title="كتم الجميع"><MicOff size={20} /></button>}
              <div className="group-call-performance">
                <div className="group-call-effects-label"><Radar size={15} /> المتابعة</div>
                <button className={`mini-icon-btn ${autoFollowScreen ? 'active' : ''}`} title="تثبيت الشاشة المشتركة تلقائياً" onClick={() => setAutoFollowScreen(v => !v)}><Pin size={14} /></button>
                <button className={`mini-icon-btn ${speakerFocus ? 'active' : ''}`} title="تركيز المتحدث النشط تلقائياً" onClick={() => setSpeakerFocus(v => !v)}><Activity size={14} /></button>
                <select className="chat-input" value={performanceMode} onChange={(e) => setPerformanceMode(e.target.value)}>
                  <option value="balanced">متوازن</option>
                  <option value="smooth">خفيف</option>
                  <option value="sharp">أوضح</option>
                </select>
              </div>
              <div className="group-call-reactions">
                <div className="group-call-effects-label"><SmilePlus size={15} /> التفاعل</div>
                <div className="group-call-reaction-buttons">
                  {['👍','👏','❤️','🔥'].map(emoji => <button key={emoji} className="mini-icon-btn" onClick={() => sendReaction(emoji)} title={`إرسال ${emoji}`}>{emoji}</button>)}
                </div>
              </div>
              {isAdmin && <button className={`call-btn ${recording ? 'active danger' : ''}`} onClick={toggleRecording} title="تسجيل المكالمة"><CircleDotDashed size={20} /></button>}
              <div className="group-call-effects">
                <div className="group-call-effects-label"><Wand2 size={15} /> الخصوصية</div>
                <select className="chat-input" value={effectMode} onChange={(e) => setEffectMode(e.target.value)}>
                  <option value="none">بدون</option>
                  <option value="blur">طمس الوجه</option>
                  <option value="mask">قناع ملامح</option>
                  <option value="glasses">نظارة</option>
                </select>
              </div>
              <button className="call-btn call-btn-end" onClick={leave}><PhoneOff size={22} /></button>
            </div>

            {isAdmin && waitingRoomEnabled && (
              <div className="group-call-pending-panel">
                <div className="group-call-participants-head"><BellRing size={14} /> طلبات الانضمام المعلقة <span className="badge-chip">{pendingJoiners.length}</span></div>
                {!pendingJoiners.length ? <div className="group-call-empty-note">لا توجد طلبات انتظار حالياً</div> : (
                  <div className="group-call-pending-list">
                    {pendingJoiners.map(item => {
                      const pendingUser = participants.find(p => p.id === item.userId) || { id: item.userId, name: `عضو ${item.userId}` };
                      return <div key={item.userId} className="group-call-pending-item"><div className="group-call-pending-meta"><Avatar user={pendingUser} size={28} /><div><strong>{pendingUser.name}</strong><div className="tiny-muted">طلب انضمام • {new Date(item.requestedAt).toLocaleTimeString()}</div></div></div><div className="group-call-pending-actions"><button className="btn btn-primary btn-small" onClick={() => admitJoiner(item.userId, true)}>قبول</button><button className="btn btn-small" onClick={() => admitJoiner(item.userId, false)}>رفض</button></div></div>;
                    })}
                  </div>
                )}
              </div>
            )}

            <div className="group-call-participants">
              <div className="group-call-participants-head"><Sparkles size={14} /> المشاركون المحتملون</div>
              <div className="group-call-participants-list">
                {participants.map(p => <div key={p.id} className={`group-participant-chip ${presentIds.has(p.id) ? 'online' : ''} ${activeSpeakerId === p.id ? 'speaking' : ''}`}><Avatar user={p} size={24} /><span>{p.name}</span><span className="badge-chip badge-chip-blue">{roleLabel(callRoles[p.id] || (p.id === user?.id ? myRole : 'listener'))}</span>{raisedHands[p.id] && <span className="badge-chip badge-chip-gold">✋</span>}{activeSpeakerId === p.id && <span className="badge-chip badge-chip-green">يتحدث</span>}<AudioLevel level={audioLevels[p.id] || 0} compact />{screenShares[p.id] && <span className="badge-chip">شاشة</span>}{pinnedUserId === p.id && <span className="badge-chip badge-chip-blue">مثبت</span>}</div>)}
              </div>
            </div>
          </div>

          {chatOpen && (
            <aside className="group-call-chat-panel">
              <div className="group-call-chat-head">
                <div>
                  <strong>دردشة المكالمة</strong>
                  <div className="tiny-muted">تعمل حتى إذا لم تتوفر الكاميرا أو الميكروفون</div>
                </div>
                <button className="mini-icon-btn" onClick={() => setChatOpen(false)} title="إخفاء دردشة المكالمة"><PinOff size={14} /></button>
              </div>
              <div className="group-call-chat-list">
                {!callChat.length ? <div className="group-call-empty-note">لا توجد رسائل بعد. يمكنك الكتابة أثناء المكالمة.</div> : callChat.map(item => {
                  const msgUser = participants.find(p => p.id === item.userId) || (item.userId === user?.id ? user : null) || { name: 'عضو' };
                  const mine = item.userId === user?.id;
                  return (
                    <div key={item.id || item.clientId} className={`group-call-chat-item ${mine ? 'mine' : ''}`}>
                      <div className="group-call-chat-author">{mine ? 'أنت' : msgUser.name}</div>
                      <div className="group-call-chat-bubble">{item.text}</div>
                      <div className="group-call-chat-time">{new Date(item.createdAt || Date.now()).toLocaleTimeString()}</div>
                    </div>
                  );
                })}
                <div ref={callChatEndRef} />
              </div>
              <div className="group-call-chat-composer">
                <textarea className="chat-input" rows={2} placeholder="اكتب رسالة داخل المكالمة" value={callChatText} onChange={(e) => setCallChatText(e.target.value)} onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    sendCallChat();
                  }
                }} />
                <button className="btn btn-primary" onClick={sendCallChat} disabled={!callChatText.trim()}>إرسال</button>
              </div>
            </aside>
          )}
        </div>
      </div>
    </div>
  );
}

function RemoteVideoTile({ stream, effectMode, performanceMode = 'balanced' }) {
  const ref = useRef(null);
  useEffect(() => {
    if (!ref.current) return;
    void attachMediaElementStream(ref.current, stream);
    applyEffect(ref.current, effectMode, performanceMode);
  }, [stream, effectMode, performanceMode]);
  return (
    <>
      <video ref={ref} autoPlay playsInline className={`group-call-video effect-${effectMode}`} />
      {effectMode === 'glasses' && performanceMode !== 'smooth' && <div className="video-effect-overlay">🕶️</div>}
      {effectMode === 'mask' && performanceMode !== 'smooth' && <div className="video-effect-overlay">🎭</div>}
    </>
  );
}


function AudioLevel({ level = 0, compact = false }) {
  const bars = [20, 45, 70].map((threshold, index) => (
    <span key={index} className={`audio-level-bar ${(level || 0) >= threshold ? 'on' : ''} ${compact ? 'compact' : ''}`} />
  ));
  return <span className={`audio-level ${compact ? 'compact' : ''}`} title={`مستوى الصوت: ${level}%`}><Activity size={12} />{bars}</span>;
}
