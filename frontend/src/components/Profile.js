import React, { useState, useRef } from 'react';
import { Save, CheckCircle, Camera, UserX, ChevronLeft, Shield, Lock, MonitorSmartphone, Copy, Palette, ShieldAlert } from 'lucide-react';
import api from '../api';
import { useAuth } from '../context/AuthContext';
import Avatar from './Avatar';

export default function Profile({ onShowBlocked, onShowPrivacy, onShowAdmin, onShowModeration, onShowSessions, onShowThemes }) {
  const { user, updateUser } = useAuth();
  const [name, setName] = useState(user.name);
  const [bio, setBio] = useState(user.bio || '');
  const [phone, setPhone] = useState(user.phone || '');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [copied, setCopied] = useState(false);
  const fileRef = useRef(null);

  const save = async () => {
    if (!name.trim()) return;
    setSaving(true);
    try {
      const r = await api.put('/users/profile', { name: name.trim(), bio, phone });
      updateUser(r.data);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch {} finally { setSaving(false); }
  };

  const uploadAvatar = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const fd = new FormData();
      fd.append('avatar', file);
      const r = await api.post('/users/avatar', fd, { headers: { 'Content-Type': 'multipart/form-data' } });
      updateUser(r.data);
    } catch {}
    e.target.value = '';
  };

  const copyId = async () => {
    try {
      await navigator.clipboard.writeText(user.publicId || '');
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {}
  };

  const MenuItem = ({ icon: Icon, label, color, onClick, subtitle }) => (
    <div onClick={onClick} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: 14, background: 'var(--bg-tertiary)', borderRadius: 12, cursor: 'pointer', marginBottom: 8, transition: 'background .15s' }}>
      <Icon size={20} color={color || 'var(--text-secondary)'} />
      <div style={{ flex: 1, textAlign: 'right' }}>
        <div style={{ fontWeight: 600, fontSize: 14 }}>{label}</div>
        {subtitle ? <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 2 }}>{subtitle}</div> : null}
      </div>
      <ChevronLeft size={18} color="var(--text-secondary)" />
    </div>
  );

  return (
    <>
      <div className="sidebar-header"><h2>الملف الشخصي</h2></div>
      <div className="profile-section">
        <div className="profile-hero">
          <div style={{ position: 'relative', display: 'inline-block' }}>
            <Avatar src={user.avatar} name={user.name} size={112} className="profile-avatar" />
            <div onClick={() => fileRef.current?.click()} className="profile-avatar-edit"><Camera size={18} color="white" /></div>
            <input ref={fileRef} type="file" hidden accept="image/*" onChange={uploadAvatar} />
          </div>
          <div style={{ marginTop: 16, fontSize: 22, fontWeight: 800 }}>{user.name}</div>
          <div style={{ marginTop: 6, color: 'var(--text-secondary)', fontSize: 13 }}>{user.email}</div>
        </div>

        <div className="profile-public-id-card">
          <div>
            <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>معرّف الحساب</div>
            <div style={{ fontSize: 18, fontWeight: 800, letterSpacing: 1.2, marginTop: 2 }}>{user.publicId || '—'}</div>
          </div>
          <button className="secondary-btn" onClick={copyId} style={{ minWidth: 92 }}>{copied ? 'تم النسخ' : <><Copy size={15} /> نسخ</>}</button>
        </div>

        <div className="profile-label">الاسم</div>
        <input className="profile-input" value={name} onChange={e => setName(e.target.value)} />
        <div className="profile-label">النبذة</div>
        <textarea className="profile-input" rows={3} value={bio} onChange={e => setBio(e.target.value)} placeholder="نبذة قصيرة عنك" />
        <div className="profile-label">الهاتف</div>
        <input className="profile-input" value={phone} onChange={e => setPhone(e.target.value)} placeholder="05xxxxxxxx" dir="ltr" />

        <button className="save-btn" onClick={save} disabled={saving}>
          {saving ? <Save size={18} /> : saved ? <CheckCircle size={18} /> : <Save size={18} />}
          {saving ? 'جاري الحفظ...' : saved ? 'تم الحفظ' : 'حفظ التغييرات'}
        </button>

        <div style={{ marginTop: 18 }}>
          <MenuItem icon={MonitorSmartphone} label="الأجهزة والجلسات" subtitle="عرض وإزالة الجلسات النشطة" onClick={onShowSessions} />
          <MenuItem icon={Palette} label="المظهر والألوان" subtitle="اختيار الثيم المناسب" onClick={onShowThemes} />
          <MenuItem icon={Lock} label="الخصوصية والأمان" subtitle="آخر ظهور وقفل التطبيق" onClick={onShowPrivacy} />
          <MenuItem icon={UserX} label="المستخدمون المحظورون" subtitle="إدارة قائمة الحظر" onClick={onShowBlocked} />
          <MenuItem icon={Shield} label="لوحة التحكم" subtitle="إحصائيات وإدارة عامة" color="var(--accent)" onClick={onShowAdmin} />
          <MenuItem icon={ShieldAlert} label="مركز الإشراف" subtitle="مراجعة البلاغات واتخاذ الإجراءات" color="var(--danger)" onClick={onShowModeration} />
        </div>
      </div>
    </>
  );
}
