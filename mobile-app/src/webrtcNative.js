let cachedModule = null;

function getWebRTCModule() {
  if (cachedModule !== null) return cachedModule;
  try {
    // eslint-disable-next-line global-require
    cachedModule = require('react-native-webrtc');
  } catch (err) {
    cachedModule = { __error: err };
  }
  return cachedModule;
}

export function getNativeWebRTCSupport() {
  const mod = getWebRTCModule();
  const available = !!mod && !mod.__error && !!mod.mediaDevices && !!mod.RTCPeerConnection;
  return { available, error: mod?.__error ? String(mod.__error?.message || mod.__error) : '' };
}

export function getRTCViewComponent() {
  const mod = getWebRTCModule();
  return mod && !mod.__error ? mod.RTCView : null;
}

export async function createNativeCallEngine({ mode = 'audio', onRemoteStream, onIceCandidate, onConnectionStateChange } = {}) {
  const mod = getWebRTCModule();
  if (!mod || mod.__error || !mod.mediaDevices || !mod.RTCPeerConnection) {
    return {
      ok: false,
      reason: 'react-native-webrtc غير متوفر في هذه البنية بعد. أبقيت واجهة المكالمة Native مع دردشة موازية، لكن البث المرئي الأصلي يحتاج تثبيت الحزمة داخل بناء أندرويد.',
      supportError: mod?.__error ? String(mod.__error?.message || mod.__error) : '',
    };
  }

  const { mediaDevices, RTCPeerConnection, RTCSessionDescription, RTCIceCandidate } = mod;
  const pc = new RTCPeerConnection({
    iceServers: [
      { urls: 'stun:stun.l.google.com:19302' },
      { urls: 'stun:stun1.l.google.com:19302' },
    ],
  });

  const constraints = {
    audio: true,
    video: mode === 'video'
      ? {
          facingMode: 'user',
          width: 640,
          height: 480,
          frameRate: 24,
        }
      : false,
  };

  let localStream = null;
  try {
    localStream = await mediaDevices.getUserMedia(constraints);
  } catch (err) {
    try {
      if (mode === 'video') {
        localStream = await mediaDevices.getUserMedia({ audio: true, video: false });
      }
    } catch (err2) {
      return {
        ok: false,
        reason: err2?.message || err?.message || 'تعذر إنشاء مسار وسائط محلي.',
      };
    }
  }

  const tracks = localStream?.getTracks?.() || [];
  tracks.forEach((track) => pc.addTrack(track, localStream));

  try {
    pc.ontrack = (event) => {
      const [stream] = event.streams || [];
      if (stream && onRemoteStream) onRemoteStream(stream);
    };
  } catch {}

  try {
    pc.onicecandidate = (event) => {
      if (event?.candidate && onIceCandidate) onIceCandidate(event.candidate);
    };
  } catch {}

  try {
    pc.onconnectionstatechange = () => {
      if (onConnectionStateChange) onConnectionStateChange(pc.connectionState || '');
    };
  } catch {}

  return {
    ok: true,
    pc,
    localStream,
    dispose() {
      try {
        (localStream?.getTracks?.() || []).forEach((t) => {
          try { t.stop(); } catch {}
        });
      } catch {}
      try { pc.close(); } catch {}
    },
    toggleAudio(enabled) {
      const audioTrack = (localStream?.getAudioTracks?.() || [])[0];
      if (audioTrack) audioTrack.enabled = enabled;
    },
    toggleVideo(enabled) {
      const videoTrack = (localStream?.getVideoTracks?.() || [])[0];
      if (videoTrack) videoTrack.enabled = enabled;
    },
    async createOffer() {
      const offer = await pc.createOffer({ offerToReceiveAudio: true, offerToReceiveVideo: mode === 'video' });
      await pc.setLocalDescription(offer);
      return offer;
    },
    async setRemoteOffer(offer) {
      const desc = RTCSessionDescription ? new RTCSessionDescription(offer) : offer;
      await pc.setRemoteDescription(desc);
    },
    async createAnswer() {
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      return answer;
    },
    async setRemoteAnswer(answer) {
      const desc = RTCSessionDescription ? new RTCSessionDescription(answer) : answer;
      await pc.setRemoteDescription(desc);
    },
    async addIceCandidate(candidate) {
      const ice = RTCIceCandidate ? new RTCIceCandidate(candidate) : candidate;
      await pc.addIceCandidate(ice);
    },
    getConnectionState() {
      return pc.connectionState || 'new';
    },
    switchCamera() {
      const videoTrack = (localStream?.getVideoTracks?.() || [])[0];
      if (videoTrack && typeof videoTrack._switchCamera === 'function') {
        videoTrack._switchCamera();
        return true;
      }
      return false;
    },
  };
}
