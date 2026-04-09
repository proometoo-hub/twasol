export const fullUrl = (value) => {
  if (!value) return null;
  if (value.startsWith('http')) return value;
  const apiBase = import.meta.env.VITE_API_BASE || '';
  const base = apiBase || window.location.origin;
  return `${base}${value}`;
};

export const formatTime = (value) => {
  if (!value) return '';
  return new Intl.DateTimeFormat(undefined, { hour: '2-digit', minute: '2-digit' }).format(new Date(value));
};

export const formatRelativeDay = (value) => {
  if (!value) return '';
  return new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }).format(new Date(value));
};

export const initials = (name = '') => name.split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]).join('').toUpperCase() || '?';
export const isImage = (value = '', mime = '') => mime.startsWith('image/') || /\.(png|jpg|jpeg|gif|webp|svg)$/i.test(value);
export const isVideo = (value = '', mime = '') => mime.startsWith('video/') || /\.(mp4|webm|ogg|mov)$/i.test(value);

export const formatDuration = (value) => {
  const total = Math.max(0, Math.floor(Number(value || 0)));
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
};
