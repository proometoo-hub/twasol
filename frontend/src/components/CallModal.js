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
      try {
        await peerRef.current.addIceCandidate(new RTCIceCandidate(raw));
      } catch (err) {
        console.warn('Buffered ICE failed:', err);
      }
    }
  }, []);

  const queueOrApplyIce = useCallback(async (candidate) => {
    if (!candidate) return;
    if (!peerRef.current || !peerRef.current.remoteDescription) {
      pendingIceRef.current.push(candidate);
      return;
    }
    try {
      await peerRef.current.addIceCandidate(new RTCIceCandidate(candidate));
    } catch (err) {
      console.warn('ICE add failed, buffering for retry:', err);
      pendingIceRef.current.push(candidate);
    }
  }, []);

  const registerPlaybackUnlock = useCallback(() => {
    if (audioPlayUnlockRef.current) return;
    const unlock = async () => {
      try {
        const element = remoteAudioRef.current;
        if (element?.srcObject) {
          const promise = element.play?.();
          if (promise?.catch) await promise.catch(() => {});
        }
      } catch {}
      document.removeEventListener('click', unlock);
      document.removeEventListener('touchstart', unlock);
      audioPlayUnlockRef.current = null;
    };
    audioPlayUnlockRef.current = unlock;
    document.addEventListener('click', unlock, { once: true });
    document.addEventListener('touchstart', unlock, { once: true });
  }, []);

  const buildFallbackStream = () => {
    const stream = new MediaStream();
    localStreamRef.current = stream;
    void attachStream(localVideoRef.current, stream, { muted: true });
    setDeviceReady(false);
    return stream;
  };

  const describeMediaError = (err) => {
    const name = err?.name || '';
    if (!navigator?.mediaDevices?.getUserMedia) return 'المتصفح أو الصفحة الحالية لا يسمحان بالوصول للكاميرا والمايك. سنكمل بدون أجهزة محلية.';
    if (!isLikelySecureMediaContext()) return 'هذا العنوان ليس Secure Context في المتصفح، لذلك قد يتم منع الكاميرا أو الميكروفون. سنكمل الاتصال بدون أجهزة محلية.';
    if (name === 'NotAllowedError' || name === 'SecurityError') return 'تم رفض إذن الكاميرا أو الميكروفون. يمكنك متابعة الاتصال والكتابة من داخل المحادثة.';
    if (name === 'NotFoundError' || name === 'DevicesNotFoundError') return 'لا توجد كاميرا أو ميكروفون متاحان. سنكمل الاتصال بدون وسائط محلية.';
    if (name === 'NotReadableError' || name === 'TrackStartError') return 'الكاميرا أو الميكروفون مشغولان من برنامج آخر. سنكمل الاتصال بدون وسائط محلية.';
    return 'تعذر تجهيز الكاميرا أو الميكروفون، لكن يمكنك متابعة الاتصال والكتابة من داخل المحادثة.';
  };

  useEffect(() => {
    if (!isIncoming) initiateCall();

    socket.on('call_answered', async ({ signal }) => {
      try {
        if (peerRef.current) {
          await peerRef.current.setRemoteDescription(new RTCSessionDescription(signal));
          await flushPendingIce();
          setStatus('connecting');
        }
      } catch (err) { console.error('Answer error:', err); }
    });

    socket.on('call_rejected', () => { setStatus('rejected'); setTimeout(onClose, 1500); });
    socket.on('call_ended', () => { cleanup(); onClose(); });
    socket.on('ice_candidate', async ({ candidate }) => {
      try {
        await queueOrApplyIce(candidate);
      } catch (err) { console.error('ICE error:', err); }
    });

    return () => {
      cleanup();
      socket.off('call_answered');
      socket.off('call_rejected');
      socket.off('call_ended');
      socket.off('ice_candidate');
    };
  }, []);

  const buildPeer = (stream) => {
    const pc = new RTCPeerConnection(RTC_CONFIGURATION);
    peerRef.current = pc;
    const tracks = stream?.getTracks?.() || [];
    const audioTrack = tracks.find(track => track.kind === 'audio');
    const videoTrack = tracks.find(track => track.kind === 'video');
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
      setConnectionState(state);
      if (state === 'connected') {
        setQuality('جيدة');
        setStatus('connected');
        if (!timerRef.current) startTimer();
      } else if (state === 'connecting' || state === 'new') {
        setQuality('جارٍ الربط');
        if (status !== 'incoming') setStatus('connecting');
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
        setPermissionError(prev => prev || (HAS_TURN_SERVER ? 'فشل الربط الصوتي/المرئي. يمكنك الرجوع إلى المحادثة ومتابعة الكتابة.' : 'فشل تأسيس الوسائط. الإعداد الحالي يستخدم STUN فقط، وهذا يفشل كثيرًا خارج نفس الشبكة. أضف TURN server في متغيرات الواجهة ثم أعد النشر.'));
        setStatus('error');
      }
    };

    pc.oniceconnectionstatechange = () => {
      const iceState = pc.iceConnectionState || 'new';
      if (iceState === 'connected' || iceState === 'completed') {
        setConnectionState('connected');
        setStatus('connected');
        setQuality('جيدة');
        if (!timerRef.current) startTimer();
      } else if (iceState === 'checking') {
        setConnectionState('checking');
        if (status !== 'incoming') setStatus('connecting');
      } else if (iceState === 'failed') {
        if (!iceRestartedRef.current) {
          iceRestartedRef.current = true;
          try { pc.restartIce?.(); } catch {}
        }
        setConnectionState('failed');
        setStatus('error');
        setQuality('فشلت المحاولة');
        setPermissionError(prev => prev || (HAS_TURN_SERVER ? 'فشل الربط الصوتي/المرئي. تأكد من الثقة بالشهادة ومن منح إذن الكاميرا والمايك ثم أعد المحاولة.' : 'فشل تأسيس الاتصال بعد تبادل الإشارات. السبب المرجح أن التطبيق يعمل حاليًا بـ STUN فقط بدون TURN server، وهذا لا يكفي على Vercel/Railway أو بين شبكات مختلفة.'));
      }
    };
    return pc;
  };

  const getMedia = async () => {
    if (!navigator?.mediaDevices?.getUserMedia) {
      const message = describeMediaError();
      setPermissionError(message);
      throw new Error(message);
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

    let lastError = null;
    for (const constraints of attempts) {
      try {
        const stream = await navigator.mediaDevices.getUserMedia(constraints);
        stream.getTracks().forEach((track) => { track.enabled = true; });
        localStreamRef.current = stream;
        setDeviceReady(!!stream.getTracks().length);
        setPermissionError(
          constraints.audio && constraints.video
            ? ''
            : constraints.audio
              ? 'تم الاتصال بالميكروفون فقط، ويمكن متابعة المكالمة بشكل طبيعي.'
              : 'تم الاتصال بالكاميرا فقط، ويمكن متابعة المكالمة بشكل طبيعي.'
        );
        void attachStream(localVideoRef.current, stream, { muted: true });
        return stream;
      } catch (err) {
        lastError = err;
      }
    }

    const message = describeMediaError(lastError);
    setPermissionError(message);
    throw lastError || new Error(message);
  };

  const initiateCall = async () => {
    try {
      clearTimeout(unansweredTimerRef.current);
      const stream = await getMedia();
      const pc = buildPeer(stream);
      iceRestartedRef.current = false;
      setStatus('connecting');
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      socket.emit('call_user', { targetUserId: targetUser.id, signal: offer, callType });
      unansweredTimerRef.current = setTimeout(() => {
        if (status === 'calling') {
          setStatus('missed');
          setTimeout(onClose, 1500);
        }
      }, 30000);
    } catch (err) {
      console.error('Call init error:', err);
      setPermissionError(describeMediaError(err));
      setStatus('error');
    }
  };

  const answerCall = async () => {
    try {
      const stream = await getMedia();
      const pc = buildPeer(stream);
      iceRestartedRef.current = false;
      setStatus('connecting');
      await pc.setRemoteDescription(new RTCSessionDescription(incomingSignal));
      await flushPendingIce();
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      socket.emit('answer_call', { targetUserId: targetUser.id, signal: answer });
    } catch (err) {
      console.error('Answer error:', err);
      setPermissionError(describeMediaError(err));
      setStatus('error');
    }
  };

  const rejectCall = () => {
    socket.emit('reject_call', { targetUserId: targetUser.id });
    onClose();
  };

  const endCall = () => {
    socket.emit('end_call', { targetUserId: targetUser.id });
    cleanup();
    onClose();
  };

  const goBackToChat = () => {
    cleanup();
    onClose();
  };

  const retryCall = async () => {
    cleanup();
    setStatus('calling');
    setTimer(0);
    setQuality('جاري الفحص');
    await initiateCall();
  };

  const toggleMute = () => {
    if (localStreamRef.current) {
      const audioTrack = localStreamRef.current.getAudioTracks()[0];
      if (audioTrack) { audioTrack.enabled = !audioTrack.enabled; setMuted(!muted); }
    }
  };

  const toggleVideo = () => {
    if (localStreamRef.current) {
      const videoTrack = localStreamRef.current.getVideoTracks()[0];
      if (videoTrack) { videoTrack.enabled = !videoTrack.enabled; setVideoOff(!videoOff); }
    }
  };

  const startTimer = () => {
    clearInterval(timerRef.current);
    timerRef.current = setInterval(() => setTimer(t => t + 1), 1000);
  };

  const cleanup = () => {
    clearTimeout(unansweredTimerRef.current);
    if (timerRef.current) clearInterval(timerRef.current);
    if (localStreamRef.current) localStreamRef.current.getTracks().forEach(t => t.stop());
    if (peerRef.current) peerRef.current.close();
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
            <div className={`live-pill ${(connectionState === 'connected' || connectionState === 'connecting') ? 'ok' : 'bad'}`}>{(connectionState === 'connected' || connectionState === 'connecting') ? <Wifi size={14} /> : <WifiOff size={14} />} {quality}</div>
          </div>
          {permissionError ? <div className="call-error">{permissionError}</div> : null}
          {status === 'error' ? <div className="call-error" style={{ marginTop: 8 }}>يمكنك العودة الآن إلى المحادثة ومتابعة التواصل بالكتابة ثم إعادة المحاولة لاحقًا.</div> : null}
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
            {status === 'calling' && (
              <button className="call-btn call-btn-end" onClick={endCall}><PhoneOff size={28} /></button>
            )}
            {status === 'connected' && (
              <>
                <button className="call-btn" style={{ background: muted ? 'var(--danger)' : 'var(--bg-tertiary)' }} onClick={toggleMute}>
                  {muted ? <MicOff size={24} color="white" /> : <Mic size={24} color="white" />}
                </button>
                {callType === 'video' && <button className="call-btn" style={{ background: videoOff ? 'var(--danger)' : 'var(--bg-tertiary)' }} onClick={toggleVideo}>{videoOff ? <VideoOff size={24} color="white" /> : <Video size={24} color="white" />}</button>}
                <button className="call-btn call-btn-end" onClick={endCall}><PhoneOff size={24} /></button>
              </>
            )}
            {(status === 'error' || status === 'missed') && (
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
