const API_BASE = import.meta.env.VITE_API_BASE || '';

const parse = async (response) => {
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || 'Request failed');
  return data;
};

export const request = async (path, options = {}) => {
  const token = localStorage.getItem('tawasol_token');
  const headers = new Headers(options.headers || {});
  if (!(options.body instanceof FormData)) headers.set('Content-Type', 'application/json');
  if (token) headers.set('Authorization', `Bearer ${token}`);
  return parse(await fetch(`${API_BASE}${path}`, { ...options, headers }));
};

export const get = (path) => request(path);
export const post = (path, body, options = {}) => request(path, { method: 'POST', body: body instanceof FormData ? body : JSON.stringify(body), ...options });
export const put = (path, body) => request(path, { method: 'PUT', body: JSON.stringify(body) });
export const remove = (path) => request(path, { method: 'DELETE' });
