import { normalizeNullable, normalizeString } from './helpers.js';

export const validateRegisterPayload = (body) => {
  const phone = normalizeNullable(body.phone);
  const email = normalizeNullable(body.email);
  const displayName = normalizeString(body.displayName);
  const username = normalizeString(body.username);
  const password = String(body.password || '');
  if ((!phone && !email) || !displayName || password.length < 6) {
    return { error: 'displayName and password (6+) plus phone or email are required' };
  }
  return { phone, email, displayName, username, password };
};

export const validateConversationTitle = (title) => {
  const clean = normalizeString(title);
  if (!clean) return { error: 'title is required' };
  if (clean.length > 80) return { error: 'title is too long' };
  return { value: clean };
};

export const validateMessagePayload = ({ text = '', type = 'text', hasFile = false }) => {
  const clean = normalizeString(text);
  if (!hasFile && !clean) return { error: 'Message content is required' };
  const allowed = ['text', 'file', 'image', 'audio', 'video'];
  return { text: clean, type: allowed.includes(type) ? type : (hasFile ? 'file' : 'text') };
};

export const validatePasswordChange = ({ currentPassword, nextPassword }) => {
  if (!currentPassword || !nextPassword || String(nextPassword).length < 6) {
    return { error: 'currentPassword and nextPassword (6+) are required' };
  }
  return { currentPassword: String(currentPassword), nextPassword: String(nextPassword) };
};
