import React from 'react';
import { buildAssetUrl } from '../api';

export default function Avatar({ src, name, size = 42 }) {
  const letters = (name || '?').trim().split(/\s+/).slice(0, 2).map(s => s[0]?.toUpperCase()).join('') || '?';
  const resolved = src?.startsWith('/uploads') ? buildAssetUrl(src) : src;
  if (resolved) return <img src={resolved} alt={name || ''} style={{ width: size, height: size, borderRadius: '50%', objectFit: 'cover', background: '#233138' }} />;
  return <div style={{ width: size, height: size, borderRadius: '50%', background: '#00a884', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700 }}>{letters}</div>;
}
