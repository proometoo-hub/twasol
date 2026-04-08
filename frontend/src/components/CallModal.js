import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Phone, PhoneOff, Video, VideoOff, Mic, MicOff, RefreshCw, Wifi, WifiOff, Gauge, Camera, MessageSquare } from 'lucide-react';
import { buildAssetUrl } from '../api';
import { RTC_CONFIGURATION, HAS_TURN_SERVER } from '../utils/webrtcConfig';

export default function CallModal({ socket, user, targetUser, callType, isIncoming, incomingSignal, onClose }) {
  const [status, setStatus] = useState(isIncoming ? 'incoming' : 'calling');
  const [timer, setTimer] = useState(0);
  const [muted, setMuted] = useState(false);
  const [videoOff, setVideoOff] = useState(false);
  const [quality, setQuality] = useState('جاري الفحص');
  const [connectionState, setConnectionState] = useState('new');
  const [permissionError, setPermissionError] = useState('');
  const [deviceReady, setDeviceReady] = useState(false);

  const peerRef = useRef(null);
  const localStreamRef = useRef(null);
  const localVideoRef = useRef(null);
  const remoteVideoRef = useRef(null);
  const remoteAudioRef = useRef(null);
  const remoteStreamRef = useRef(null);
  const timerRef = useRef(null);
  const unansweredTimerRef = useRef(null);
  const pendingIceRef = useRef([]);
  const audioPlayUnlockRef = useRef(null);
  const iceRestartedRef = useRef(false);
  const statusRef = useRef(status);
  const mountedRef = useRef(true);

  // Keep statusRef in sync
  useEffect(() => { statusRef.current = status; }, [status]);

  const isLikelySecureMediaContext = () => {
    if (typeof window === 'undefined') return true;
    const host = window.location.hostname;
    return window.isSecureContext || host === 'localhost' || host === '127.0.0.1';
  };

  const attachStream = async (element, stream, { muted = false } = {}) => {
    if (!element) return;
    element.srcObject = stream || null;
    element.muted = muted;
    element.autoplay = true;
    element.playsInline = true;
    try {
      const playPromise = element.play?.();
      if (playPromise?.catch) await playPromise.catch(() => {});
    } catch {}
  };

  const buildTrackStream = (event, fallbackRef) => {
    if (event?.streams?.[0]) return event.streams[0];
    const stream = fallbackRef.current || new MediaStream();
    const track = event?.track;
    if (track && !stream.getTracks().some((item) => item.id === track.id)) stream.addTrack(track);
    fallbackRef.current = stream;
    return stream;
  };

  const flushPendingIce = useCallback(async () => {
    if (!peerRef.current?.remoteDescription || !pendingIceRef.current.length) return;
    const queue = [...pendingIceRef.current];
    pendingIceRef.current = [];
    for (const raw of queue) {
      try { await peerRef.current.addIceCandidate(new RTCIceCandidate(raw)); } catch {}
    }
  }, []);

  const queueOrApplyIce = useCallback(async (candidate) => {
    if (!candidate) return;
    if (!peerRef.current || !peerRef.current.remoteDescription) {
      pendingIceRef.current.push(candidate);
      return;
    }
    try { await peerRef.current.addIceCandidate(new RTCIceCandidate(candidate)); }
    catch { pendingIceRef.current.push(candidate); }
  }, []);

  const registerPlaybackUnlock = useCallback(() => {
    if (audioPlayUnlockRef.current) return;
    const unlock = async () => {
      try {
        const element = remoteAudioRef.current;
        if (element?.srcObject) { const p = element.play?.(); if (p?.catch) await p.catch(() => {}); }
      } catch {}
      document.removeEventListener('click', unlock);
      document.removeEventListener('touchstart', unlock);
      audioPlayUnlockRef.current = null;
    };
    audioPlayUnlockRef.current = unlock;
    document.addEventListener('click', unlock, { once: true });
    document.addEventListener('touchstart', unlock, { once: true });
  }, []);

  const describeMediaError = (err) => {
    const name = err?.name || '';
    if (!navigator?.mediaDevices?.getUserMedia) return 'المتصفح لا يدعم الوصول للكاميرا/المايك. سنكمل الاتصال بدون أجهزة محلية — يمكنك سماع الطرف الآخر.';
    if (!isLikelySecureMediaContext()) return 'هذا العنوان ليس آمناً (HTTPS مطلوب). سنكمل الاتصال — يمكنك سماع الطرف الآخر.';
    if (name === 'NotAllowedError' || name === 'SecurityError') return 'تم رفض إذن الكاميرا/المايك. المكالمة مستمرة — يمكنك سماع الطرف الآخر.';
    if (name === 'NotFoundError' || name === 'DevicesNotFoundError') return 'لا توجد كاميرا أو ميكروفون. المكالمة مستمرة — يمكنك سماع الطرف الآخر.';
    if (name === 'NotReadableError' || name === 'TrackStartError') return 'الكاميرا/المايك مشغولان. المكالمة مستمرة — يمكنك سماع الطرف الآخر.';
    return 'تعذر تجهيز الكاميرا/المايك. المكالمة مستمرة — يمكنك سماع الطرف الآخر.';
  };

  const getMediaSafe = async () => {
    if (!navigator?.mediaDevices?.getUserMedia) {
      setPermissionError(describeMediaError());
      setDeviceReady(false);
      return new MediaStream();
    }

    const tunedAudio = { echoCancellation: true, noiseSuppression: true, autoGainControl: true };
    const tunedVideo = { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 720 } };
    const attempts = callType === 'video'
      ? [
          { audio: tunedAudio, video: tunedVideo },
          { audio: tunedAudio, video: true },
          { audio: tunedAudio, video: false },
          { audio: false, video: tunedVideo },
        ]
      : [
          { audio: tunedAudio, video: false },
        ];

    for (const constraints of attempts) {
      try {
        const stream = await navigator.mediaDevices.getUserMedia(constraints);
        stream.getTracks().forEach((track) => { track.enabled = true; });
        localStreamRef.current = stream;
        setDeviceReady(!!stream.getTracks().length);
        setPermissionError(
          constraints.audio && constraints.video ? ''
            : constraints.audio ? 'ميكروفون فقط — المكالمة تعمل بشكل طبيعي.'
            : 'كاميرا فقط — المكالمة تعمل بشكل طبيعي.'
        );
        void attachStream(localVideoRef.current, stream, { muted: true });
        return stream;
      } catch {}
    }

    // All attempts failed — return empty stream so call still works (receive-only)
    const fallback = new MediaStream();
    localStreamRef.current = fallback;
    setDeviceReady(false);
    setPermissionError(describeMediaError({ name: 'NotFoundError' }));
    return fallback;
  };

  const buildPeer = (stream) => {
    const pc = new RTCPeerConnection(RTC_CONFIGURATION);
    peerRef.current = pc;
    const tracks = stream?.getTracks?.() || [];
    const audioTrack = tracks.find(t => t.kind === 'audio');
    const videoTrack = tracks.find(t => t.kind === 'video');

    if (audioTrack) { audioTrack.enabled = true; pc.addTrack(audioTrack, stream); }
    else pc.addTransceiver('audio', { direction: 'recvonly' });

    if (callType === 'video') {
      if (videoTrack) { videoTrack.enabled = true; pc.addTrack(videoTrack, stream); }
      else pc.addTransceiver('video', { direction: 'recvonly' });
    }

    pc.onicecandidate = (e) => {
      if (e.candidate) socket.emit('ice_candidate', { targetUserId: targetUser.id, candidate: e.candidate });
    };
    pc.ontrack = (e) => {
      const remoteStream = buildTrackStream(e, remoteStreamRef);
      void attachStream(remoteVideoRef.current, remoteStream);
      void attachStream(remoteAudioRef.current, remoteStream);
      registerPlaybackUnlock();
    };

    pc.onconnectionstatechange = () => {
      const state = pc.connectionState || 'new';
      if (!mountedRef.current) return;
      setConnectionState(state);
      if (state === 'connected') {
        setQuality('جيدة');
        setStatus('connected');
        if (!timerRef.current) startTimer();
      } else if (state === 'connecting' || state === 'new') {
        setQuality('جارٍ الربط');
        if (statusRef.current !== 'incoming') setStatus('connecting');
      } else if (state === 'disconnected') {
        setQuality('ضعيفة');
        setStatus('reconnecting');
        if (!iceRestartedRef.current) {
          iceRestartedRef.current = true;
          setTimeout(() => { try { pc.restartIce?.(); } catch {} }, 1200);
        }
      } else if (state === 'failed') {
        if (!iceRestartedRef.current) {
          iceRestartedRef.current = true;
          try { pc.restartIce?.(); } catch {}
        }
        setQuality('فشلت المحاولة');
        setPermissionError(prev => prev || (HAS_TURN_SERVER
          ? 'فشل الربط الصوتي/المرئي. تأكد من إعدادات الشبكة وأعد المحاولة.'
          : 'فشل الاتصال — لا يوجد TURN server. أضف TURN server في إعدادات الواجهة لإجراء مكالمات عبر شبكات مختلفة.'));
        setStatus('error');
      }
    };

    pc.oniceconnectionstatechange = () => {
      const iceState = pc.iceConnectionState || 'new';
      if (!mountedRef.current) return;
      if (iceState === 'connected' || iceState === 'completed') {
        setConnectionState('connected');
        setStatus('connected');
        setQuality('جيدة');
        if (!timerRef.current) startTimer();
      } else if (iceState === 'checking') {
        setConnectionState('checking');
        if (statusRef.current !== 'incoming') setStatus('connecting');
      } else if (iceState === 'failed') {
        if (!iceRestartedRef.current) {
          iceRestartedRef.current = true;
          try { pc.restartIce?.(); } catch {}
        }
        setConnectionState('failed');
        setStatus('error');
        setQuality('فشلت المحاولة');
        setPermissionError(prev => prev || (HAS_TURN_SERVER
          ? 'فشل الربط. تأكد من الثقة بالشهادة ومنح إذن الكاميرا والمايك.'
          : 'فشل الاتصال — التطبيق يعمل بـ STUN فقط بدون TURN server. أضف TURN server للمكالمات عبر شبكات مختلفة.'));
      }
    };
    return pc;
  };

  const initiateCall = async () => {
    clearTimeout(unansweredTimerRef.current);
    iceRestartedRef.current = false;

    // Always get media — getMediaSafe never throws, returns empty stream on failure
    const stream = await getMediaSafe();
    const pc = buildPeer(stream);
    setStatus('connecting');

    try {
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      socket.emit('call_user', { targetUserId: targetUser.id, signal: offer, callType });

      unansweredTimerRef.current = setTimeout(() => {
        if (statusRef.current === 'calling' || statusRef.current === 'connecting') {
          setStatus('missed');
          setTimeout(onClose, 2000);
        }
      }, 30000);
    } catch (err) {
      console.error('Call offer error:', err);
      setStatus('error');
      setPermissionError('فشل إنشاء عرض الاتصال. أعد المحاولة.');
    }
  };

  const answerCall = async () => {
    const stream = await getMediaSafe();
    const pc = buildPeer(stream);
    iceRestartedRef.current = false;
    setStatus('connecting');

    try {
      await pc.setRemoteDescription(new RTCSessionDescription(incomingSignal));
      await flushPendingIce();
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      socket.emit('answer_call', { targetUserId: targetUser.id, signal: answer });
    } catch (err) {
      console.error('Answer error:', err);
      setStatus('error');
      setPermissionError('فشل الرد على المكالمة. أعد المحاولة.');
    }
  };

  const rejectCall = () => { socket.emit('reject_call', { targetUserId: targetUser.id }); onClose(); };
  const endCall = () => { socket.emit('end_call', { targetUserId: targetUser.id }); cleanup(); onClose(); };
  const goBackToChat = () => { cleanup(); onClose(); };

  const retryCall = async () => {
    cleanup();
    setStatus('calling');
    setTimer(0);
    setQuality('جاري الفحص');
    setPermissionError('');
    setConnectionState('new');
    await initiateCall();
  };

  const toggleMute = () => {
    if (localStreamRef.current) {
      const audioTrack = localStreamRef.current.getAudioTracks()[0];
      if (audioTrack) { audioTrack.enabled = !audioTrack.enabled; setMuted(!audioTrack.enabled); }
    }
  };

  const toggleVideo = () => {
    if (localStreamRef.current) {
      const videoTrack = localStreamRef.current.getVideoTracks()[0];
      if (videoTrack) { videoTrack.enabled = !videoTrack.enabled; setVideoOff(!videoTrack.enabled); }
    }
  };

  const startTimer = () => {
    clearInterval(timerRef.current);
    timerRef.current = setInterval(() => setTimer(t => t + 1), 1000);
  };

  const cleanup = () => {
    clearTimeout(unansweredTimerRef.current);
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = null;
    if (localStreamRef.current) localStreamRef.current.getTracks().forEach(t => t.stop());
    if (peerRef.current) { try { peerRef.current.close(); } catch {} }
    if (localVideoRef.current) localVideoRef.current.srcObject = null;
    if (remoteVideoRef.current) remoteVideoRef.current.srcObject = null;
    if (remoteAudioRef.current) remoteAudioRef.current.srcObject = null;
    remoteStreamRef.current = null;
    localStreamRef.current = null;
    peerRef.current = null;
    pendingIceRef.current = [];
    iceRestartedRef.current = false;
    if (audioPlayUnlockRef.current) {
      document.removeEventListener('click', audioPlayUnlockRef.current);
      document.removeEventListener('touchstart', audioPlayUnlockRef.current);
      audioPlayUnlockRef.current = null;
    }
  };

  useEffect(() => {
    mountedRef.current = true;

    if (!isIncoming) initiateCall();

    const onCallAnswered = async ({ signal }) => {
      try {
        if (peerRef.current) {
          await peerRef.current.setRemoteDescription(new RTCSessionDescription(signal));
          await flushPendingIce();
          setStatus('connecting');
        }
      } catch (err) { console.error('Answer set error:', err); }
    };

    const onCallRejected = () => { setStatus('rejected'); setTimeout(onClose, 1500); };
    const onCallEnded = () => { cleanup(); onClose(); };
    const onIceCandidate = async ({ candidate }) => {
      try { await queueOrApplyIce(candidate); } catch {}
    };

    socket.on('call_answered', onCallAnswered);
    socket.on('call_rejected', onCallRejected);
    socket.on('call_ended', onCallEnded);
    socket.on('ice_candidate', onIceCandidate);

    return () => {
      mountedRef.current = false;
      cleanup();
      socket.off('call_answered', onCallAnswered);
      socket.off('call_rejected', onCallRejected);
      socket.off('call_ended', onCallEnded);
      socket.off('ice_candidate', onIceCandidate);
    };
  }, []);

  const formatTimer = (s) => {
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return `${m.toString().padStart(2, '0')}:${sec.toString().padStart(2, '0')}`;
  };

  const statusText = {
    calling: 'جاري الاتصال...',
    connecting: 'جاري تأسيس الاتصال...',
    reconnecting: 'محاولة إعادة الربط...',
    incoming: 'مكالمة واردة',
    connected: formatTimer(timer),
    rejected: 'تم الرفض',
    error: 'تعذر إكمال المكالمة',
    missed: 'لم يتم الرد'
  };

  return (
    <div className="call-overlay">
      {callType === 'video' && status === 'connected' ? (
        <div className="call-videos">
          <video ref={remoteVideoRef} className="call-remote-video" autoPlay playsInline />
          <audio ref={remoteAudioRef} autoPlay playsInline />
          <video ref={localVideoRef} className="call-local-video" autoPlay playsInline muted />
          <div className="call-diagnostics floating">
            <div className="live-pill ok"><Gauge size={14} /> الجودة: {quality}</div>
            <div className={`live-pill ${connectionState === 'connected' ? 'ok' : 'bad'}`}>{connectionState === 'connected' ? <Wifi size={14} /> : <WifiOff size={14} />}{connectionState}</div>
          </div>
          <div style={{ position: 'absolute', bottom: 30, left: '50%', transform: 'translateX(-50%)' }} className="call-actions">
            <button className="call-btn" style={{ background: muted ? 'var(--danger)' : 'var(--bg-tertiary)' }} onClick={toggleMute}>
              {muted ? <MicOff size={24} color="white" /> : <Mic size={24} color="white" />}
            </button>
            <button className="call-btn" style={{ background: videoOff ? 'var(--danger)' : 'var(--bg-tertiary)' }} onClick={toggleVideo}>
              {videoOff ? <VideoOff size={24} color="white" /> : <Video size={24} color="white" />}
            </button>
            <button className="call-btn call-btn-end" onClick={endCall}><PhoneOff size={24} /></button>
          </div>
          <div style={{ position: 'absolute', top: 20, left: '50%', transform: 'translateX(-50%)' }} className="call-timer">{formatTimer(timer)}</div>
        </div>
      ) : (
        <>
          <img src={buildAssetUrl(targetUser?.avatar)} alt="" className="call-avatar" />
          <div className="call-name">{targetUser?.name}</div>
          <div className="call-status">{statusText[status]}</div>
          <div className="call-diagnostics">
            <div className={`live-pill ${deviceReady ? 'ok' : 'bad'}`}><Camera size={14} /> {callType === 'video' ? 'كاميرا/ميكروفون' : 'ميكروفون'}: {deviceReady ? 'جاهز' : 'غير جاهز'}</div>
            <div className={`live-pill ${(connectionState === 'connected' || connectionState === 'connecting' || connectionState === 'checking') ? 'ok' : 'bad'}`}>{(connectionState === 'connected' || connectionState === 'connecting' || connectionState === 'checking') ? <Wifi size={14} /> : <WifiOff size={14} />} {quality}</div>
          </div>
          {permissionError ? <div className="call-error">{permissionError}</div> : null}
          {status === 'error' ? <div className="call-error" style={{ marginTop: 8 }}>يمكنك العودة إلى المحادثة ومتابعة التواصل بالكتابة ثم إعادة المحاولة لاحقاً.</div> : null}
          {status === 'connected' && <div className="call-timer">{formatTimer(timer)}</div>}
          <video ref={localVideoRef} style={{ display: 'none' }} autoPlay playsInline muted />
          <video ref={remoteVideoRef} style={{ display: 'none' }} autoPlay playsInline />
          <audio ref={remoteAudioRef} autoPlay playsInline />

          <div className="call-actions">
            {status === 'incoming' && (
              <>
                <button className="call-btn call-btn-reject" onClick={rejectCall}><PhoneOff size={28} /></button>
                <button className="call-btn call-btn-accept" onClick={answerCall}><Phone size={28} /></button>
              </>
            )}
            {(status === 'calling' || status === 'connecting') && (
              <button className="call-btn call-btn-end" onClick={endCall}><PhoneOff size={28} /></button>
            )}
            {(status === 'connected' || status === 'reconnecting') && (
              <>
                <button className="call-btn" style={{ background: muted ? 'var(--danger)' : 'var(--bg-tertiary)' }} onClick={toggleMute}>
                  {muted ? <MicOff size={24} color="white" /> : <Mic size={24} color="white" />}
                </button>
                {callType === 'video' && <button className="call-btn" style={{ background: videoOff ? 'var(--danger)' : 'var(--bg-tertiary)' }} onClick={toggleVideo}>{videoOff ? <VideoOff size={24} color="white" /> : <Video size={24} color="white" />}</button>}
                <button className="call-btn call-btn-end" onClick={endCall}><PhoneOff size={24} /></button>
              </>
            )}
            {(status === 'error' || status === 'missed' || status === 'rejected') && (
              <>
                <button className="call-btn call-btn-accept" onClick={retryCall} title="إعادة المحاولة"><RefreshCw size={24} /></button>
                <button className="call-btn" onClick={goBackToChat} title="العودة إلى المحادثة"><MessageSquare size={24} color="white" /></button>
              </>
            )}
          </div>
        </>
      )}
    </div>
  );
}
