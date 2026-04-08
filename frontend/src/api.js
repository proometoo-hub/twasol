import axios from 'axios';
import { clearStoredAuthSession, getStoredToken } from './utils/authStorage';

const browserProtocol = window.location.protocol === 'http:' || window.location.protocol === 'https:' ? window.location.protocol : '';
const runtimeHost = window.location.protocol === 'file:' || !window.location.hostname ? 'localhost' : window.location.hostname;
const apiHost = process.env.REACT_APP_API_HOST || runtimeHost;
const apiPort = process.env.REACT_APP_API_PORT || '4000';
const protocol = process.env.REACT_APP_API_PROTOCOL || browserProtocol || 'http:';
function normalizeOrigin(value) {
  const raw = String(value || '').trim().replace(/\/+$/, '');
  return raw.replace(/\/api$/i, '');
}

const explicitApiUrl = normalizeOrigin(process.env.REACT_APP_API_URL || process.env.REACT_APP_BACKEND_ORIGIN || '');
const explicitSocketUrl = normalizeOrigin(process.env.REACT_APP_SOCKET_URL || process.env.REACT_APP_BACKEND_ORIGIN || explicitApiUrl);
const useSameOrigin = process.env.REACT_APP_USE_SAME_ORIGIN === 'true'
  || (!explicitApiUrl && window.location.protocol !== 'file:' && window.location.port !== '3020' && !process.env.REACT_APP_API_HOST);

export const API_URL = explicitApiUrl || (useSameOrigin ? window.location.origin : `${protocol}//${apiHost}:${apiPort}`);
export const SOCKET_URL = explicitSocketUrl || (useSameOrigin ? window.location.origin : `${protocol}//${apiHost}:${apiPort}`);

export function buildAssetUrl(resourcePath) {
  const raw = String(resourcePath || '').trim();
  if (!raw) return '';
  if (/^(https?:|data:|blob:)/i.test(raw)) return raw;
  const normalized = raw.startsWith('/') ? raw : `/${raw}`;
  if (normalized.startsWith('/uploads/')) {
    const filename = normalized.split('/').pop();
    const token = getStoredToken();
    return `${API_URL}/api/media/${encodeURIComponent(filename || '')}${token ? `?token=${encodeURIComponent(token)}` : ''}`;
  }
  return `${API_URL}${normalized}`;
}

const api = axios.create({ baseURL: `${API_URL}/api` });

api.interceptors.request.use((config) => {
  const token = getStoredToken();
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

api.interceptors.response.use((res) => res, (err) => {
  if (err.response?.status === 403 || err.response?.status === 401) {
    clearStoredAuthSession();
    window.location.reload();
  }
  return Promise.reject(err);
});

export default api;
