import { useEffect, useMemo, useRef, useState } from 'react';
import { t } from '../i18n/strings';
import { formatDuration } from '../utils/format';
import Avatar from './Avatar';

const statusLabel = (locale, callState) => {
  const map = {
    incoming: t(locale, 'incomingCall'),
    calling: locale === 'ar' ? 'جارٍ الاتصال…' : 'Calling…',
    connecting: locale === 'ar' ? 'جارٍ الربط…' : 'Connecting…',
    connected: locale === 'ar' ? 'مكالمة نشطة' : 'Live call',
    rejected: locale === 'ar' ? 'تم الرفض' : 'Rejected',
    busy: t(locale, 'busy'),
    ended: locale === 'ar' ? 'انتهت المكالمة' : 'Call ended',
  };
  return map[callState?.status] || callState?.status || '';
};

export default function CallOverlay({
  locale,
  callState,
  onAccept,
  onEnd,
  onReject,
  onToggleMic,
  onToggleCamera,
}) {
  const localVideoRef = useRef(null);
  const remoteVideoRef = useRef(null);
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    if (localVideoRef.current && callState?.localStream) localVideoRef.current.srcObject = callState.localStream;
    if (remoteVideoRef.current && callState?.remoteStream) remoteVideoRef.current.srcObject = callState.remoteStream;
  }, [callState]);

  useEffect(() => {
    if (!callState?.startedAt) {
      setElapsed(0);
      return undefined;
    }
    const tick = () => setElapsed(Math.max(0, Math.floor((Date.now() - new Date(callState.startedAt).getTime()) / 1000)));
    tick();
    const timer = setInterval(tick, 1000);
    return () => clearInterval(timer);
  }, [callState?.startedAt, callState?.status]);

  const isVideo = callState?.kind === 'video';
  const subtitle = useMemo(() => {
    if (!callState) return '';
    if (callState.status === 'connected') return `${statusLabel(locale, callState)} · ${formatDuration(elapsed)}`;
    if (callState.status === 'incoming') return locale === 'ar' ? 'اسحب للرد أو اختر قبول' : 'Incoming secure call';
    return statusLabel(locale, callState);
  }, [callState, elapsed, locale]);

  if (!callState) return null;

  return (
    <div className="call-overlay">
      <div className="call-card polished-call-card premium-call-card">
        <div className="call-top-banner">
          <span className="eyebrow">{t(locale, 'callControls')}</span>
          <span className={`status-chip ${callState.status === 'connected' ? 'online' : ''}`}>{subtitle}</span>
        </div>

        <div className="call-hero premium-call-hero">
          <Avatar src={callState.peer?.avatarUrl} name={callState.peer?.displayName || 'Call'} size={104} />
          <div>
            <h3>{callState.peer?.displayName || callState.conversation?.title}</h3>
            <p>{isVideo ? t(locale, 'video') : t(locale, 'audio')}</p>
          </div>
        </div>

        <div className="call-media-grid polished-call-grid premium-call-grid">
          <div className="call-media-box spotlight-box dark-glass">
            {isVideo && callState.remoteStream ? (
              <video autoPlay playsInline ref={remoteVideoRef} />
            ) : (
              <div className="audio-pill large">{callState.status === 'connected' ? (locale === 'ar' ? 'الصوت متصل' : 'Audio live') : subtitle}</div>
            )}
          </div>
          <div className="call-media-box secondary-box dark-glass">
            {isVideo && callState.localStream ? (
              <video autoPlay muted playsInline ref={localVideoRef} className="local-preview-video" />
            ) : (
              <div className="audio-pill">{callState.micMuted ? (locale === 'ar' ? 'الميكروفون مكتوم' : 'Mic muted') : t(locale, 'audio')}</div>
            )}
          </div>
        </div>

        {callState.status !== 'incoming' && (
          <div className="call-metrics-row">
            <div className="call-metric-card">
              <strong>{formatDuration(elapsed)}</strong>
              <span>{locale === 'ar' ? 'المدة' : 'Duration'}</span>
            </div>
            <div className="call-metric-card">
              <strong>{callState.micMuted ? (locale === 'ar' ? 'مغلق' : 'Off') : (locale === 'ar' ? 'مفتوح' : 'On')}</strong>
              <span>{locale === 'ar' ? 'الميكروفون' : 'Microphone'}</span>
            </div>
            <div className="call-metric-card">
              <strong>{callState.cameraOff ? (locale === 'ar' ? 'متوقفة' : 'Off') : (locale === 'ar' ? 'مفعلة' : 'On')}</strong>
              <span>{locale === 'ar' ? 'الكاميرا' : 'Camera'}</span>
            </div>
          </div>
        )}

        <div className="call-actions enhanced-call-actions premium-call-actions">
          {callState.status === 'incoming' ? (
            <>
              <button type="button" className="primary-button accept-call-button" onClick={onAccept}>{t(locale, 'accept')}</button>
              <button type="button" className="ghost-button danger reject-call-button" onClick={onReject}>{t(locale, 'reject')}</button>
            </>
          ) : (
            <>
              <button type="button" className={`ghost-button compact call-control-pill ${callState.micMuted ? 'active' : ''}`} onClick={onToggleMic}>
                {callState.micMuted ? (locale === 'ar' ? 'فتح الميكروفون' : 'Unmute mic') : (locale === 'ar' ? 'كتم الميكروفون' : 'Mute mic')}
              </button>
              {isVideo && (
                <button type="button" className={`ghost-button compact call-control-pill ${callState.cameraOff ? 'active' : ''}`} onClick={onToggleCamera}>
                  {callState.cameraOff ? (locale === 'ar' ? 'تشغيل الكاميرا' : 'Camera on') : (locale === 'ar' ? 'إيقاف الكاميرا' : 'Camera off')}
                </button>
              )}
              <button type="button" className="ghost-button danger end-call-button" onClick={onEnd}>{t(locale, 'endCall')}</button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
