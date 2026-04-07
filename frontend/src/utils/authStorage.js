const TOKEN_KEY = 'token';
const USER_KEY = 'user';

export function getStoredToken() {
  return sessionStorage.getItem(TOKEN_KEY) || localStorage.getItem(TOKEN_KEY) || '';
}

export function getStoredUser() {
  const raw = sessionStorage.getItem(USER_KEY) || localStorage.getItem(USER_KEY);
  if (!raw) return null;
  try { return JSON.parse(raw); } catch { return null; }
}

export function storeAuthSession(user, token) {
  sessionStorage.setItem(TOKEN_KEY, token || '');
  sessionStorage.setItem(USER_KEY, JSON.stringify(user || null));
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
}

export function updateStoredUser(user) {
  sessionStorage.setItem(USER_KEY, JSON.stringify(user || null));
  localStorage.removeItem(USER_KEY);
}

export function clearStoredAuthSession() {
  sessionStorage.removeItem(TOKEN_KEY);
  sessionStorage.removeItem(USER_KEY);
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
}
