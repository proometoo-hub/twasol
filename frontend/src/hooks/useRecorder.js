import { useState, useRef, useCallback } from 'react';
import api from '../api';

function pickSupportedAudioFormat() {
  const candidates = [
    { mimeType: 'audio/webm;codecs=opus', ext: 'webm' },
    { mimeType: 'audio/webm', ext: 'webm' },
    { mimeType: 'audio/ogg;codecs=opus', ext: 'ogg' },
    { mimeType: 'audio/mp4', ext: 'm4a' },
  ];
  if (typeof MediaRecorder === 'undefined') return { mimeType: '', ext: 'webm' };
  return candidates.find((item) => !item.mimeType || MediaRecorder.isTypeSupported?.(item.mimeType)) || { mimeType: '', ext: 'webm' };
}

export default function useRecorder(socket, chatId) {
  const [recording, setRecording] = useState(false);
  const [paused, setPaused] = useState(false);
  const [recordTime, setRecordTime] = useState(0);

  const recorderRef = useRef(null);
  const streamRef = useRef(null);
  const chunksRef = useRef([]);
  const timerRef = useRef(null);

  const start = useCallback(async () => {
    try {
      if (!window.isSecureContext) throw new Error('secure-context-required');
      const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } });
      streamRef.current = stream;
      const format = pickSupportedAudioFormat();
      const recorder = format.mimeType ? new MediaRecorder(stream, { mimeType: format.mimeType }) : new MediaRecorder(stream);
      chunksRef.current = [];
      recorder.ondataavailable = (e) => { if (e.data?.size) chunksRef.current.push(e.data); };
      recorder.onstop = async () => {
        stream.getTracks().forEach(t => t.stop());
        const blob = new Blob(chunksRef.current, { type: format.mimeType || 'audio/webm' });
        if (blob.size < 100) return;
        const file = new File([blob], `voice-${Date.now()}.${format.ext}`, { type: format.mimeType || 'audio/webm' });
        const formData = new FormData();
        formData.append('file', file);
        try {
          const res = await api.post('/upload', formData, { headers: { 'Content-Type': 'multipart/form-data' } });
          if (socket?.current) {
            socket.current.emit('send_message', {
              conversationId: chatId, text: null, type: 'voice',
              fileUrl: res.data.fileUrl, fileName: res.data.fileName,
              fileSize: res.data.fileSize, tempId: Date.now()
            });
          }
        } catch (err) { console.error('Voice upload error:', err); }
      };
      recorder.start(250);
      recorderRef.current = recorder;
      setRecording(true);
      setPaused(false);
      setRecordTime(0);
      timerRef.current = setInterval(() => setRecordTime(t => t + 1), 1000);
    } catch (err) { console.error('Mic error:', err); }
  }, [socket, chatId]);

  const pause = useCallback(() => {
    if (recorderRef.current && recording && !paused) {
      recorderRef.current.pause();
      clearInterval(timerRef.current);
      setPaused(true);
    }
  }, [recording, paused]);

  const resume = useCallback(() => {
    if (recorderRef.current && recording && paused) {
      recorderRef.current.resume();
      timerRef.current = setInterval(() => setRecordTime(t => t + 1), 1000);
      setPaused(false);
    }
  }, [recording, paused]);

  const stop = useCallback(() => {
    if (recorderRef.current && recording) {
      recorderRef.current.stop();
      clearInterval(timerRef.current);
      setRecording(false);
      setPaused(false);
      setRecordTime(0);
    }
  }, [recording]);

  const cancel = useCallback(() => {
    if (recorderRef.current && recording) {
      recorderRef.current.ondataavailable = null;
      recorderRef.current.onstop = () => { streamRef.current?.getTracks().forEach(t => t.stop()); };
      recorderRef.current.stop();
      clearInterval(timerRef.current);
      setRecording(false);
      setPaused(false);
      setRecordTime(0);
    }
  }, [recording]);

  const formatTime = (s) => `${Math.floor(s / 60)}:${(s % 60).toString().padStart(2, '0')}`;

  return { recording, paused, recordTime, start, pause, resume, stop, cancel, formatTime: formatTime(recordTime) };
}
