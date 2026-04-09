import { useEffect, useMemo, useRef, useState } from 'react';
import { formatDuration, fullUrl } from '../utils/format';

const buildBars = (meta) => {
  if (Array.isArray(meta?.waveform) && meta.waveform.length) return meta.waveform.slice(0, 36);
  const duration = Number(meta?.durationSec || 0);
  const count = Math.max(16, Math.min(32, Math.round(duration * 2) || 22));
  return Array.from({ length: count }, (_, index) => 18 + ((index * 13) % 40));
};

export default function VoiceNotePlayer({ message, compact = false }) {
  const audioRef = useRef(null);
  const [playing, setPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [duration, setDuration] = useState(Number(message?.meta?.durationSec || 0));
  const src = useMemo(() => fullUrl(message?.mediaUrl), [message?.mediaUrl]);
  const bars = useMemo(() => buildBars(message?.meta || {}), [message?.meta]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return undefined;

    const handleLoaded = () => {
      if (Number.isFinite(audio.duration) && audio.duration > 0) setDuration(audio.duration);
    };
    const handleTime = () => setProgress(audio.currentTime || 0);
    const handlePlay = () => setPlaying(true);
    const handlePause = () => setPlaying(false);
    const handleEnded = () => {
      setPlaying(false);
      setProgress(0);
    };

    audio.addEventListener('loadedmetadata', handleLoaded);
    audio.addEventListener('timeupdate', handleTime);
    audio.addEventListener('play', handlePlay);
    audio.addEventListener('pause', handlePause);
    audio.addEventListener('ended', handleEnded);

    return () => {
      audio.removeEventListener('loadedmetadata', handleLoaded);
      audio.removeEventListener('timeupdate', handleTime);
      audio.removeEventListener('play', handlePlay);
      audio.removeEventListener('pause', handlePause);
      audio.removeEventListener('ended', handleEnded);
    };
  }, [src]);

  const ratio = duration ? Math.min(1, progress / duration) : 0;

  return (
    <div className={`voice-note-player ${compact ? 'compact' : ''}`}>
      <audio ref={audioRef} preload="metadata" src={src} />
      <button
        type="button"
        className={`voice-note-play ${playing ? 'playing' : ''}`}
        onClick={() => {
          if (!audioRef.current) return;
          if (playing) audioRef.current.pause();
          else audioRef.current.play().catch(() => {});
        }}
      >
        {playing ? '❚❚' : '▶'}
      </button>

      <div className="voice-note-body">
        <div className="voice-note-wave">
          {bars.map((bar, index) => (
            <span
              key={`${index}-${bar}`}
              className={index / bars.length <= ratio ? 'active' : ''}
              style={{ height: `${bar}%` }}
            />
          ))}
        </div>
        <div className="voice-note-meta">
          <strong>{formatDuration(Math.round(progress || duration || 0))}</strong>
          <span>{message?.meta?.label || 'Voice note'}</span>
        </div>
      </div>
    </div>
  );
}
