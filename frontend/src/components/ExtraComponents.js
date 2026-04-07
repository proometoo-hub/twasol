import React from 'react';
import { buildAssetUrl } from '../api';

export function ContactCard({ user, onOpen }) {
  if (!user) return null;
  const avatarSrc = user.avatar?.startsWith('/uploads') ? buildAssetUrl(user.avatar) : user.avatar;
  return <div className="contact-card" onClick={() => onOpen?.(user.id)}>
    <div className="contact-avatar">{avatarSrc ? <img src={avatarSrc} alt={user.name} /> : <span>{(user.name || '?')[0]}</span>}</div>
    <div className="contact-meta"><div className="contact-name">{user.name}</div><div className="contact-desc">{user.publicId ? `ID: ${user.publicId}` : (user.email || user.phone || '')}</div></div>
  </div>;
}
