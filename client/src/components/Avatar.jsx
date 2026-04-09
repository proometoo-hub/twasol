import { fullUrl, initials } from '../utils/format';

export default function Avatar({ src, name, size = 44 }) {
  const url = fullUrl(src);
  return url ? (
    <img className="avatar" src={url} alt={name} style={{ width: size, height: size }} />
  ) : (
    <div className="avatar avatar-fallback" style={{ width: size, height: size }} title={name}>{initials(name)}</div>
  );
}
