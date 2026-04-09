import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { t } from '../i18n/strings';
import { formatDuration } from '../utils/format';
import EmojiPicker from './EmojiPicker';

const pickSupportedAudioType = () => {
  const candidates = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg;codecs=opus'];
  return candidates.find((type) => window.MediaRecorder?.isTypeSupported?.(type)) || '';
};

const compressImageFile = async (file) => {
  if (!file?.type?.startsWith('image/')) return file;
  const bitmap = await createImageBitmap(file);
  const maxSide = 1600;
  const ratio = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bitmap.width * ratio);
  canvas.height = Math.round(bitmap.height * ratio);
  const ctx = canvas.getContext('2d');
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.82));
  if (!blob) return file;
  return new File([blob], file.name.replace(/\.\w+$/, '.jpg'), { type: 'image/jpeg' });
};

export default function Composer({ locale, onSend, onTyping, replyTo, onCancelReply, conversationId }) {
  const fileRef = useRef(null);
  const imageRef = useRef(null);
  const recorderRef = useRef(null);
  const recordStreamRef = useRef(null);
  const recordContextRef = useRef(null);
  const analyserRef = useRef(null);
  const chunksRef = useRef([]);
  const waveformRef = useRef([]);
  const textareaRef = useRef(null);
  const typingTimeoutRef = useRef(null);
  const scheduleTimeoutRef = useRef(null);
  const previewUrlRef = useRef(null);
  const startedAtRef = useRef(null);
  const pausedTotalRef = useRef(0);
  const pauseStartedRef = useRef(null);
  const [text, setText] = useState('');
  const [selectedFile, setSelectedFile] = useState(null);
  const [scheduleAt, setScheduleAt] = useState('');
  const [showExtras, setShowExtras] = useState(false);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [recordingState, setRecordingState] = useState('idle');
  const [recordingDuration, setRecordingDuration] = useState(0);
  const [recordingPreview, setRecordingPreview] = useState(null);
  const [recordingError, setRecordingError] = useState('');
  const draftKey = `tawasol_draft_${conversationId || 'global'}`;

  useEffect(() => () => {
    clearTimeout(typingTimeoutRef.current);
    clearTimeout(scheduleTimeoutRef.current);
    if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current);
    if (recordContextRef.current) recordContextRef.current.close().catch(() => {});
    recordStreamRef.current?.getTracks?.().forEach((track) => track.stop());
  }, []);

  useEffect(() => {
    const saved = localStorage.getItem(draftKey);
    if (saved) setText(saved);
    else setText('');
    setSelectedFile(null);
    setScheduleAt('');
  }, [draftKey]);

  useEffect(() => {
    if (text.trim()) localStorage.setItem(draftKey, text);
    else localStorage.removeItem(draftKey);
  }, [draftKey, text]);

  useLayoutEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    textarea.style.height = '0px';
    const nextHeight = Math.min(Math.max(textarea.scrollHeight, 52), 160);
    textarea.style.height = `${nextHeight}px`;
    textarea.style.overflowY = textarea.scrollHeight > 160 ? 'auto' : 'hidden';
  }, [text]);

  useEffect(() => {
    if (recordingState !== 'recording') return undefined;
    const timer = setInterval(() => {
      if (!startedAtRef.current) return;
      setRecordingDuration(Math.max(0, Math.round((Date.now() - startedAtRef.current - pausedTotalRef.current) / 1000)));
      if (analyserRef.current) {
        const analyser = analyserRef.current;
        const data = new Uint8Array(analyser.fftSize);
        analyser.getByteTimeDomainData(data);
        let sum = 0;
        for (let index = 0; index < data.length; index += 1) {
          const normalized = (data[index] - 128) / 128;
          sum += Math.abs(normalized);
        }
        const amplitude = Math.min(100, Math.max(8, Math.round((sum / data.length) * 250)));
        waveformRef.current.push(amplitude);
        if (waveformRef.current.length > 60) waveformRef.current.shift();
      }
    }, 150);
    return () => clearInterval(timer);
  }, [recordingState]);

  const emitTyping = (isTyping) => onTyping?.(isTyping);
  const scheduleStopTyping = () => {
    clearTimeout(typingTimeoutRef.current);
    typingTimeoutRef.current = setTimeout(() => emitTyping(false), 1200);
  };

  const resetComposer = () => {
    setText('');
    setSelectedFile(null);
    setScheduleAt('');
    setShowEmojiPicker(false);
    localStorage.removeItem(draftKey);
    emitTyping(false);
    onCancelReply?.();
    if (textareaRef.current) {
      textareaRef.current.style.height = '52px';
      textareaRef.current.style.overflowY = 'hidden';
    }
  };

  const actuallySend = async (payload) => {
    await onSend(payload);
    resetComposer();
  };

  const maybeSchedule = async (payload) => {
    if (!scheduleAt) {
      await actuallySend(payload);
      return;
    }
    const due = new Date(scheduleAt).getTime() - Date.now();
    if (Number.isNaN(due) || due <= 0) {
      await actuallySend(payload);
      return;
    }
    const snapshot = { ...payload };
    scheduleTimeoutRef.current = setTimeout(() => {
      onSend(snapshot).catch(() => {});
    }, due);
    resetComposer();
  };

  const clearRecordingResources = () => {
    if (recordContextRef.current) recordContextRef.current.close().catch(() => {});
    recordContextRef.current = null;
    analyserRef.current = null;
    if (recordStreamRef.current) {
      recordStreamRef.current.getTracks().forEach((track) => track.stop());
      recordStreamRef.current = null;
    }
  };

  const discardRecording = () => {
    if (recorderRef.current && recorderRef.current.state !== 'inactive') {
      recorderRef.current.onstop = null;
      recorderRef.current.stop();
    }
    recorderRef.current = null;
    chunksRef.current = [];
    waveformRef.current = [];
    startedAtRef.current = null;
    pausedTotalRef.current = 0;
    pauseStartedRef.current = null;
    setRecordingDuration(0);
    setRecordingState('idle');
    setRecordingPreview((current) => {
      if (current?.previewUrl) URL.revokeObjectURL(current.previewUrl);
      return null;
    });
    clearRecordingResources();
  };

  const finalizeRecording = async () => {
    const mimeType = recorderRef.current?.mimeType || pickSupportedAudioType() || 'audio/webm';
    const extension = mimeType.includes('ogg') ? 'ogg' : mimeType.includes('mp4') ? 'm4a' : 'webm';
    const blob = new Blob(chunksRef.current, { type: mimeType });
    const previewUrl = URL.createObjectURL(blob);
    previewUrlRef.current = previewUrl;
    const file = new File([blob], `voice-${Date.now()}.${extension}`, { type: mimeType });
    setRecordingPreview({
      file,
      previewUrl,
      durationSec: recordingDuration,
      waveform: waveformRef.current.slice(-48),
    });
    setRecordingState('review');
    clearRecordingResources();
  };

  const sendText = async () => {
    const value = text.trim();
    if (!value && !selectedFile) return;
    if (selectedFile) {
      await sendFile(selectedFile, selectedFile.type.startsWith('image/') ? 'image' : 'file', value);
      return;
    }
    await maybeSchedule({ text: value, type: 'text', replyToId: replyTo?.id || null });
  };

  const sendFile = async (file, type = 'file', caption = '', meta = null) => {
    const finalFile = type === 'image' ? await compressImageFile(file) : file;
    await maybeSchedule({ text: caption, type, file: finalFile, replyToId: replyTo?.id || null, meta });
  };

  const pickFile = (file) => {
    setSelectedFile(file);
    setShowExtras(true);
  };

  const startRecording = async () => {
    setRecordingError('');
    try {
      if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) throw new Error('secure-context-required');
      if (!window.MediaRecorder) throw new Error('MediaRecorder is not supported');
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      recordStreamRef.current = stream;
      const mimeType = pickSupportedAudioType();
      const recorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);
      recorderRef.current = recorder;
      chunksRef.current = [];
      waveformRef.current = [];
      pausedTotalRef.current = 0;
      pauseStartedRef.current = null;
      startedAtRef.current = Date.now();
      setRecordingDuration(0);

      const context = new (window.AudioContext || window.webkitAudioContext)();
      recordContextRef.current = context;
      const source = context.createMediaStreamSource(stream);
      const analyser = context.createAnalyser();
      analyser.fftSize = 256;
      source.connect(analyser);
      analyserRef.current = analyser;

      recorder.ondataavailable = (event) => {
        if (event.data?.size) chunksRef.current.push(event.data);
      };
      recorder.onstop = async () => {
        await finalizeRecording();
      };
      recorder.start(250);
      setRecordingState('recording');
    } catch (error) {
      setRecordingError(
        locale === 'ar'
          ? 'تعذر بدء التسجيل. تأكد من إذن الميكروفون وتشغيل التطبيق على localhost أو HTTPS.'
          : 'Unable to start recording. Check microphone permission and run on localhost or HTTPS.',
      );
      discardRecording();
    }
  };

  const togglePauseRecording = () => {
    const recorder = recorderRef.current;
    if (!recorder) return;
    if (recordingState === 'recording') {
      recorder.pause();
      pauseStartedRef.current = Date.now();
      setRecordingState('paused');
      return;
    }
    if (recordingState === 'paused') {
      recorder.resume();
      if (pauseStartedRef.current) pausedTotalRef.current += Date.now() - pauseStartedRef.current;
      pauseStartedRef.current = null;
      setRecordingState('recording');
    }
  };

  const stopRecording = () => {
    if (!recorderRef.current) return;
    if (recordingState === 'paused' && pauseStartedRef.current) {
      pausedTotalRef.current += Date.now() - pauseStartedRef.current;
      pauseStartedRef.current = null;
    }
    recorderRef.current.stop();
  };

  const sendRecordedVoice = async () => {
    if (!recordingPreview?.file) return;
    await sendFile(recordingPreview.file, 'audio', text.trim(), {
      durationSec: recordingPreview.durationSec,
      waveform: recordingPreview.waveform,
      label: locale === 'ar' ? 'رسالة صوتية' : 'Voice note',
    });
    discardRecording();
  };

  return (
    <div className="composer-wrap upgraded-composer-wrap">
      {replyTo && (
        <div className="reply-bar frosted-box upgraded-reply-bar">
          <div>
            <strong>{t(locale, 'replyingTo')} {replyTo.senderName}</strong>
            <div>{replyTo.text || replyTo.mediaName || replyTo.type}</div>
          </div>
          <button type="button" className="ghost-button compact" onClick={onCancelReply}>{t(locale, 'cancel')}</button>
        </div>
      )}

      {selectedFile && (
        <div className="attachment-preview frosted-box upgraded-attachment-preview">
          <div>
            <strong>{selectedFile.name}</strong>
            <span>{Math.round(selectedFile.size / 1024)} KB</span>
          </div>
          <button type="button" className="ghost-button compact" onClick={() => setSelectedFile(null)}>{t(locale, 'cancel')}</button>
        </div>
      )}

      {recordingState !== 'idle' && (
        <div className={`recording-panel frosted-box ${recordingState}`}>
          <div className="recording-panel-main">
            <div className="recording-indicator-wrap">
              <span className={`record-dot ${recordingState === 'recording' ? 'live' : ''}`} />
              <strong>{recordingState === 'review' ? (locale === 'ar' ? 'معاينة الرسالة الصوتية' : 'Voice note preview') : (locale === 'ar' ? 'تسجيل صوتي' : 'Voice recording')}</strong>
            </div>
            <span className="recording-time">{formatDuration(recordingDuration)}</span>
          </div>

          {!!waveformRef.current.length && recordingState !== 'review' && (
            <div className="recording-wave-inline">
              {waveformRef.current.map((bar, index) => (
                <span key={`${index}-${bar}`} style={{ height: `${bar}%` }} />
              ))}
            </div>
          )}

          {recordingState === 'review' && recordingPreview && (
            <div className="recording-review-box">
              <audio controls src={recordingPreview.previewUrl} />
              <div className="recording-review-actions">
                <button type="button" className="ghost-button compact danger" onClick={discardRecording}>{locale === 'ar' ? 'حذف' : 'Discard'}</button>
                <button type="button" className="primary-button compact" onClick={sendRecordedVoice}>{locale === 'ar' ? 'إرسال التسجيل' : 'Send voice note'}</button>
              </div>
            </div>
          )}

          {recordingState !== 'review' && (
            <div className="recording-actions-row">
              <button type="button" className="ghost-button compact danger" onClick={discardRecording}>{locale === 'ar' ? 'إلغاء' : 'Cancel'}</button>
              <button type="button" className="ghost-button compact" onClick={togglePauseRecording}>{recordingState === 'paused' ? (locale === 'ar' ? 'استئناف' : 'Resume') : (locale === 'ar' ? 'إيقاف مؤقت' : 'Pause')}</button>
              <button type="button" className="primary-button compact" onClick={stopRecording}>{locale === 'ar' ? 'إنهاء' : 'Finish'}</button>
            </div>
          )}
        </div>
      )}

      {!!recordingError && <div className="composer-footnote error-note">{recordingError}</div>}

      {showEmojiPicker && (
        <EmojiPicker
          locale={locale}
          onClose={() => setShowEmojiPicker(false)}
          onSelect={(emoji) => {
            setText((current) => `${current}${emoji}`);
          }}
        />
      )}

      {showExtras && (
        <div className="composer-extra-panel frosted-box">
          <div className="composer-extra-actions">
            <button type="button" className="ghost-button compact" onClick={() => imageRef.current?.click()}>{t(locale, 'sendImage')}</button>
            <button type="button" className="ghost-button compact" onClick={() => fileRef.current?.click()}>{t(locale, 'sendFile')}</button>
          </div>
          <div className="schedule-box compact">
            <span>{t(locale, 'schedule')}</span>
            <input type="datetime-local" value={scheduleAt} onChange={(e) => setScheduleAt(e.target.value)} />
            {!!scheduleAt && <button type="button" className="ghost-inline" onClick={() => setScheduleAt('')}>{t(locale, 'clearSchedule')}</button>}
          </div>
        </div>
      )}

      <div className="composer cleaner-composer">
        <button type="button" className={`ghost-button compact toolbar-button ${showExtras ? 'active' : ''}`} onClick={() => setShowExtras((current) => !current)} title={t(locale, 'moreOptions')}>＋</button>
        <button type="button" className={`ghost-button compact toolbar-button ${showEmojiPicker ? 'active' : ''}`} onClick={() => setShowEmojiPicker((current) => !current)} title={t(locale, 'addEmoji')}>😊</button>
        <input ref={fileRef} hidden type="file" onChange={(e) => e.target.files?.[0] && pickFile(e.target.files[0])} />
        <input ref={imageRef} hidden type="file" accept="image/*" onChange={(e) => e.target.files?.[0] && pickFile(e.target.files[0])} />
        <textarea
          ref={textareaRef}
          rows={1}
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            emitTyping(Boolean(e.target.value.trim()));
            scheduleStopTyping();
          }}
          onBlur={() => emitTyping(false)}
          onKeyDown={(e) => {
            if (e.nativeEvent?.isComposing) return;
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              if (recordingState !== 'recording' && recordingState !== 'paused') sendText();
            }
          }}
          placeholder={t(locale, 'typeMessage')}
        />
        <button
          type="button"
          className={`ghost-button compact toolbar-button ${recordingState === 'recording' ? 'is-recording' : ''}`}
          onClick={() => {
            if (recordingState === 'idle') startRecording();
            else if (recordingState === 'review') discardRecording();
            else stopRecording();
          }}
          title={t(locale, 'record')}
        >
          {recordingState === 'idle' ? '🎙️' : recordingState === 'review' ? '🗑️' : '⏹️'}
        </button>
        <button type="button" className="primary-button send-button" onClick={sendText}>{scheduleAt ? t(locale, 'scheduleSend') : t(locale, 'send')}</button>
      </div>

      <div className="composer-footnote compact-composer-footnote">
        <span>{t(locale, 'draftSaved')}</span>
        <span>{scheduleAt ? `${t(locale, 'scheduledFor')}: ${new Date(scheduleAt).toLocaleString()}` : t(locale, 'scheduleHint')}</span>
      </div>
    </div>
  );
}
