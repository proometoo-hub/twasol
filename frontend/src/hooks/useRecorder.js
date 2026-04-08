import { useState, useRef, useCallback } from 'react';
import api from '../api';

function isSupportedMime(mimeType) {
  return typeof MediaRecorder !== 'undefined' && (!mimeType || MediaRecorder.isTypeSupported?.(mimeType));
}

function pickSupportedAudioFormat() {
  const candidates = [
    { mimeType: 'audio/webm;codecs=opus', ext: 'webm' },
    { mimeType: 'audio/webm', ext: 'webm' },
    { mimeType: 'audio/ogg;codecs=opus', ext: 'ogg' },
    { mimeType: 'audio/mp4;codecs=mp4a.40.2', ext: 'm4a' },
    { mimeType: 'audio/mp4', ext: 'm4a' },
    { mimeType: 'audio/aac', ext: 'aac' },
    { mimeType: '', ext: 'webm' },
  ];
  if (typeof MediaRecorder === 'undefined') return { mimeType: '', ext: 'webm' };
  return candidates.find((item) => isSupportedMime(item.mimeType)) || { mimeType: '', ext: 'webm' };
}

function getSecureContextState() {
  if (typeof window === 'undefined') return true;
  const host = window.location.hostname;
  return window.isSecureContext || host === 'localhost' || host === '127.0.0.1';
}

async function postVoiceMessage(chatId, payload) {
  const res = await api.post(`/messages/${chatId}`, payload);
  return res.data;
}

export default function useRecorder(socket, chatId) {
  const [recording, setRecording] = useState(false);
  const [paused, setPaused] = useState(false);
  const [recordTime, setRecordTime] = useState(0);
  const [error, setError] = useState('');
  const [sending, setSending] = useState(false);
  const [lastUploadedUrl, setLastUploadedUrl] = useState('');

  const recorderRef = useRef(null);
  const streamRef = useRef(null);
  const chunksRef = useRef([]);
  const timerRef = useRef(null);
  const formatRef = useRef(pickSupportedAudioFormat());

  const cleanupStream = useCallback(() => {
    streamRef.current?.getTracks?.().forEach((track) => track.stop());
    streamRef.current = null;
    recorderRef.current = null;
    clearInterval(timerRef.current);
  }, []);

  const start = useCallback(async () => {
    try {
      setError('');
      if (!chatId) throw new Error('missing-chat');
      if (typeof MediaRecorder === 'undefined') throw new Error('media-recorder-unsupported');
      if (!navigator?.mediaDevices?.getUserMedia) throw new Error('media-devices-unsupported');
      if (!getSecureContextState()) throw new Error('secure-context-required');
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
        video: false,
      });
      stream.getTracks().forEach((track) => { track.enabled = true; });
      streamRef.current = stream;
      formatRef.current = pickSupportedAudioFormat();
      const recorder = formatRef.current.mimeType ? new MediaRecorder(stream, { mimeType: formatRef.current.mimeType }) : new MediaRecorder(stream);
      chunksRef.current = [];
      recorder.ondataavailable = (e) => { if (e.data?.size) chunksRef.current.push(e.data); };
      recorder.onerror = (e) => { console.error('Recorder error:', e); setError('تعذر تسجيل الصوت على هذا المتصفح أو الجهاز.'); };
      recorder.onstop = async () => {
        const format = formatRef.current;
        const blobType = format.mimeType || chunksRef.current?.[0]?.type || 'audio/webm';
        const blob = new Blob(chunksRef.current, { type: blobType });
        cleanupStream();
        setRecording(false);
        setPaused(false);
        setRecordTime(0);
        if (blob.size < 256) {
          setError('لم يتم التقاط صوت كافٍ. حاول التحدث بعد بدء التسجيل مباشرة.');
          return;
        }
        const ext = format.ext || (blobType.includes('ogg') ? 'ogg' : blobType.includes('mp4') || blobType.includes('m4a') ? 'm4a' : 'webm');
        const file = new File([blob], `voice-${Date.now()}.${ext}`, { type: blobType });
        const formData = new FormData();
        formData.append('file', file);
        setSending(true);
        try {
          const uploadRes = await api.post('/upload', formData, { headers: { 'Content-Type': 'multipart/form-data' } });
          const payload = {
            conversationId: chatId,
            text: null,
            type: 'voice',
            fileUrl: uploadRes.data.fileUrl,
            fileName: uploadRes.data.fileName,
            fileSize: uploadRes.data.fileSize,
            tempId: Date.now(),
          };
          setLastUploadedUrl(uploadRes.data.fileUrl || '');
          const s = socket?.current;
          if (s?.connected) {
            s.emit('send_message', payload);
          } else {
            await postVoiceMessage(chatId, payload);
          }
          setError('');
        } catch (err) {
          console.error('Voice upload error:', err);
          setError(err?.response?.data?.error || 'تعذر رفع الرسالة الصوتية أو إرسالها.');
        } finally {
          setSending(false);
        }
      };
      recorder.start(500);
      recorderRef.current = recorder;
      setRecording(true);
      setPaused(false);
      setRecordTime(0);
      timerRef.current = setInterval(() => setRecordTime(t => t + 1), 1000);
    } catch (err) {
      console.error('Mic error:', err);
      cleanupStream();
      if (err?.name === 'NotAllowedError' || err?.message === 'secure-context-required') setError('المتصفح منع الميكروفون. افتح الموقع عبر HTTPS موثوق واسمح بالوصول للمايك.');
      else if (err?.name === 'NotFoundError') setError('لم يتم العثور على ميكروفون متاح على هذا الجهاز.');
      else if (err?.message === 'media-recorder-unsupported') setError('هذا المتصفح لا يدعم تسجيل الصوت داخل الدردشة.');
      else setError('تعذر بدء تسجيل الصوت. تأكد من إذن الميكروفون ثم أعد المحاولة.');
    }
  }, [chatId, cleanupStream, socket]);

  const pause = useCallback(() => {
    if (recorderRef.current && recording && !paused && recorderRef.current.state === 'recording') {
      recorderRef.current.pause();
      clearInterval(timerRef.current);
      setPaused(true);
    }
  }, [recording, paused]);

  const resume = useCallback(() => {
    if (recorderRef.current && recording && paused && recorderRef.current.state === 'paused') {
      recorderRef.current.resume();
      clearInterval(timerRef.current);
      timerRef.current = setInterval(() => setRecordTime(t => t + 1), 1000);
      setPaused(false);
    }
  }, [recording, paused]);

  const stop = useCallback(() => {
    if (recorderRef.current && recording) {
      try { recorderRef.current.stop(); } catch {}
    }
  }, [recording]);

  const cancel = useCallback(() => {
    if (recorderRef.current && recording) {
      recorderRef.current.ondataavailable = null;
      recorderRef.current.onstop = () => { cleanupStream(); setRecording(false); setPaused(false); setRecordTime(0); };
      try { recorderRef.current.stop(); } catch {}
    }
  }, [cleanupStream, recording]);

  const clearError = useCallback(() => setError(''), []);
  const formatTime = (s) => `${Math.floor(s / 60)}:${(s % 60).toString().padStart(2, '0')}`;

  return {
    isRecording: recording,
    recording,
    paused,
    recordTime,
    start,
    pause,
    resume,
    stop,
    cancel,
    sending,
    error,
    clearError,
    lastUploadedUrl,
    formatTime: formatTime(recordTime),
  };
}
