export const DEFAULT_WEB_URL = process.env.EXPO_PUBLIC_MOBILE_WEB_URL || 'https://11.0.0.103:4000';
export const DEFAULT_API_URL = process.env.EXPO_PUBLIC_API_URL || 'https://11.0.0.103:4000';

export function normalizeUrl(value, fallbackProtocol = 'https') {
  const raw = String(value || '').trim();
  if (!raw) return '';
  if (/^https?:\/\//i.test(raw)) return raw.replace(/\/$/, '');
  return `${fallbackProtocol}://${raw.replace(/\/$/, '')}`;
}

export function deriveApiUrlFromWeb(webUrl) {
  try {
    const url = new URL(normalizeUrl(webUrl));
    const port = url.port === '3020' ? '4000' : (url.port || '4000');
    return `${url.protocol}//${url.hostname}:${port}`;
  } catch {
    return normalizeUrl(DEFAULT_API_URL);
  }
}

export function deriveWebUrlFromApi(apiUrl) {
  try {
    const url = new URL(normalizeUrl(apiUrl));
    const port = url.port || '4000';
    return `${url.protocol}//${url.hostname}:${port}`;
  } catch {
    return normalizeUrl(DEFAULT_WEB_URL);
  }
}
