import { deriveWebUrlFromApi, normalizeUrl } from './config';

async function parseJsonSafe(res) {
  try {
    return await res.json();
  } catch {
    return null;
  }
}

export function createApiClient(getBaseUrl, getToken) {
  async function request(path, options = {}) {
    const baseUrl = normalizeUrl(getBaseUrl());
    const token = getToken?.();
    const headers = {
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    };
    if (token) headers.Authorization = `Bearer ${token}`;
    const res = await fetch(`${baseUrl}${path}`, { ...options, headers });
    const data = await parseJsonSafe(res);
    if (!res.ok) {
      const message = data?.error || data?.message || `HTTP ${res.status}`;
      throw new Error(message);
    }
    return data;
  }

  return {
    async health() {
      const baseUrl = normalizeUrl(getBaseUrl());
      const res = await fetch(`${baseUrl}/api/health`);
      const data = await parseJsonSafe(res);
      if (!res.ok) throw new Error(data?.error || 'تعذر الوصول إلى الخادم');
      return data;
    },
    login(email, password) {
      return request('/api/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) });
    },
    register(name, email, password) {
      return request('/api/auth/register', { method: 'POST', body: JSON.stringify({ name, email, password }) });
    },
    rooms() {
      return request('/api/rooms/my');
    },
    roomInfo(id) {
      return request(`/api/rooms/${id}/info`);
    },

    searchUsers(q) {
      return request(`/api/users/search?q=${encodeURIComponent(q)}`);
    },
    openPrivate(otherUserId) {
      return request(`/api/rooms/private/${otherUserId}`);
    },
    createRoom(payload) {
      return request('/api/rooms/create', { method: 'POST', body: JSON.stringify(payload) });
    },
    me() {
      return request('/api/users/me');
    },
    updateProfile(payload) {
      return request('/api/users/profile', { method: 'PUT', body: JSON.stringify(payload) });
    },
    registerPushToken(payload) {
      return request('/api/push/token', { method: 'POST', body: JSON.stringify(payload || {}) });
    },
    unregisterPushToken(expoPushToken) {
      return request('/api/push/token', { method: 'DELETE', body: JSON.stringify({ expoPushToken }) });
    },
    async uploadFile(file) {
      const baseUrl = normalizeUrl(getBaseUrl());
      const token = getToken?.();
      const form = new FormData();
      form.append('file', {
        uri: file.uri,
        name: file.name || file.fileName || `upload-${Date.now()}`,
        type: file.mimeType || file.type || 'application/octet-stream',
      });
      const headers = {};
      if (token) headers.Authorization = `Bearer ${token}`;
      const res = await fetch(`${baseUrl}/api/upload`, { method: 'POST', headers, body: form });
      const data = await parseJsonSafe(res);
      if (!res.ok) throw new Error(data?.error || data?.message || 'فشل رفع الملف');
      return data;
    },
    messages(conversationId) {
      return request(`/api/messages/${conversationId}`);
    },
    unreadCounts() {
      return request('/api/messages/unread/counts');
    },
    async logout() {
      try {
        return await request('/api/auth/logout', { method: 'POST' });
      } catch {
        return { success: true };
      }
    },
    webUrl() {
      return deriveWebUrlFromApi(getBaseUrl());
    }
  };
}
