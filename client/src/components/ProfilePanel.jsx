import { useEffect, useMemo, useRef, useState } from 'react';
import { post, put, remove } from '../api/client';
import { t } from '../i18n/strings';
import Avatar from './Avatar';

const tabs = ['profileOverview', 'appearance', 'privacy', 'security', 'blocked'];
const themeOptions = ['dark', 'light', 'ocean', 'forest', 'dusk'];

export default function ProfilePanel({ open, onClose, user, locale, updateUser, blockedUsers, onBlockedChange }) {
  const fileRef = useRef(null);
  const [activeTab, setActiveTab] = useState('profileOverview');
  const [form, setForm] = useState({
    displayName: user?.displayName || '',
    bio: user?.bio || '',
    locale: user?.locale || 'ar',
    theme: user?.theme || 'dark',
    privacyLastSeen: user?.privacyLastSeen || 'contacts',
    privacyStatusViews: user?.privacyStatusViews || 'contacts',
    privacyReadReceipts: user?.privacyReadReceipts ?? true,
  });
  const [passwords, setPasswords] = useState({ currentPassword: '', nextPassword: '' });
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setForm({
      displayName: user?.displayName || '',
      bio: user?.bio || '',
      locale: user?.locale || 'ar',
      theme: user?.theme || 'dark',
      privacyLastSeen: user?.privacyLastSeen || 'contacts',
      privacyStatusViews: user?.privacyStatusViews || 'contacts',
      privacyReadReceipts: user?.privacyReadReceipts ?? true,
    });
    setPasswords({ currentPassword: '', nextPassword: '' });
    setActiveTab('profileOverview');
  }, [user, open]);

  const profileStats = useMemo(() => ([
    { label: t(locale, 'language'), value: form.locale.toUpperCase() },
    { label: t(locale, 'theme'), value: t(locale, form.theme) },
    { label: t(locale, 'readReceipts'), value: form.privacyReadReceipts ? 'ON' : 'OFF' },
  ]), [form.locale, form.theme, form.privacyReadReceipts, locale]);

  if (!open || !user) return null;

  const save = async () => {
    setBusy(true);
    try {
      const data = await put('/api/auth/me', form);
      updateUser(data.user);
      onClose();
    } finally {
      setBusy(false);
    }
  };

  const uploadAvatar = async (file) => {
    const formData = new FormData();
    formData.append('file', file);
    const uploaded = await post('/api/uploads', formData);
    const updated = await put('/api/auth/me', { avatarUrl: uploaded.file.url });
    updateUser(updated.user);
  };

  const unblock = async (id) => {
    await remove(`/api/users/block/${id}`);
    onBlockedChange?.();
  };

  const changePassword = async () => {
    if (!passwords.currentPassword || !passwords.nextPassword) return;
    await post('/api/auth/change-password', passwords);
    setPasswords({ currentPassword: '', nextPassword: '' });
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-card profile-card polished-profile" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <div>
            <span className="eyebrow">{t(locale, 'profile')}</span>
            <h3>{user.displayName}</h3>
          </div>
          <button type="button" className="ghost-button compact" onClick={onClose}>{t(locale, 'cancel')}</button>
        </div>

        <div className="profile-layout">
          <aside className="profile-sidebar frosted-box">
            <div className="profile-avatar-block vertical">
              <Avatar src={user.avatarUrl} name={user.displayName} size={86} />
              <button className="ghost-button compact" onClick={() => fileRef.current?.click()} type="button">{t(locale, 'attach')}</button>
              <input ref={fileRef} hidden type="file" accept="image/*" onChange={(e) => e.target.files?.[0] && uploadAvatar(e.target.files[0])} />
              <strong>{user.displayName}</strong>
              <span>@{user.username}</span>
            </div>

            <div className="profile-stat-grid">
              {profileStats.map((item) => (
                <div key={item.label} className="metric-card small">
                  <strong>{item.value}</strong>
                  <span>{item.label}</span>
                </div>
              ))}
            </div>

            <div className="profile-tabs">
              {tabs.map((tab) => (
                <button key={tab} type="button" className={activeTab === tab ? 'is-active' : ''} onClick={() => setActiveTab(tab)}>
                  {t(locale, tab)}
                </button>
              ))}
            </div>
          </aside>

          <div className="profile-content">
            {activeTab === 'profileOverview' && (
              <div className="section-block">
                <div className="split-grid two-cols">
                  <label><span>{t(locale, 'displayName')}</span><input value={form.displayName} onChange={(e) => setForm({ ...form, displayName: e.target.value })} /></label>
                  <label><span>{t(locale, 'bio')}</span><input value={form.bio} onChange={(e) => setForm({ ...form, bio: e.target.value })} /></label>
                </div>
                <div className="frosted-box info-stack">
                  <strong>{t(locale, 'polishedExperience')}</strong>
                  <span>{t(locale, 'onboardingLine2')}</span>
                </div>
              </div>
            )}

            {activeTab === 'appearance' && (
              <div className="section-block">
                <div className="split-grid two-cols">
                  <label>
                    <span>{t(locale, 'language')}</span>
                    <select value={form.locale} onChange={(e) => setForm({ ...form, locale: e.target.value })}>
                      <option value="ar">العربية</option>
                      <option value="en">English</option>
                    </select>
                  </label>
                  <label>
                    <span>{t(locale, 'theme')}</span>
                    <select value={form.theme} onChange={(e) => setForm({ ...form, theme: e.target.value })}>
                      {themeOptions.map((theme) => <option key={theme} value={theme}>{t(locale, theme)}</option>)}
                    </select>
                  </label>
                </div>
                <div className="theme-preview-grid expanded-theme-grid">
                  {themeOptions.map((theme) => (
                    <button key={theme} type="button" className={`theme-preview theme-preview-card ${theme}-preview ${form.theme === theme ? 'is-active' : ''}`} onClick={() => setForm({ ...form, theme })}>
                      <span className="theme-preview-swatch" />
                      <strong>{t(locale, theme)}</strong>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {activeTab === 'privacy' && (
              <div className="section-block">
                <div className="split-grid two-cols">
                  <label>
                    <span>{t(locale, 'lastSeen')}</span>
                    <select value={form.privacyLastSeen} onChange={(e) => setForm({ ...form, privacyLastSeen: e.target.value })}>
                      <option value="everyone">Everyone</option>
                      <option value="contacts">Contacts</option>
                      <option value="nobody">Nobody</option>
                    </select>
                  </label>
                  <label>
                    <span>{t(locale, 'statusViews')}</span>
                    <select value={form.privacyStatusViews} onChange={(e) => setForm({ ...form, privacyStatusViews: e.target.value })}>
                      <option value="everyone">Everyone</option>
                      <option value="contacts">Contacts</option>
                      <option value="nobody">Nobody</option>
                    </select>
                  </label>
                </div>
                <label className="checkbox-row polished-checkbox">
                  <input type="checkbox" checked={form.privacyReadReceipts} onChange={(e) => setForm({ ...form, privacyReadReceipts: e.target.checked })} />
                  <span>{t(locale, 'readReceipts')}</span>
                </label>
                <div className="mini-note">{t(locale, 'securityNote')}</div>
              </div>
            )}

            {activeTab === 'security' && (
              <div className="section-block">
                <div className="split-grid two-cols">
                  <label><span>{t(locale, 'currentPassword')}</span><input type="password" value={passwords.currentPassword} onChange={(e) => setPasswords({ ...passwords, currentPassword: e.target.value })} /></label>
                  <label><span>{t(locale, 'newPassword')}</span><input type="password" value={passwords.nextPassword} onChange={(e) => setPasswords({ ...passwords, nextPassword: e.target.value })} /></label>
                </div>
                <button className="ghost-button" onClick={changePassword}>{t(locale, 'save')}</button>
              </div>
            )}

            {activeTab === 'blocked' && (
              <div className="section-block">
                <h4>{t(locale, 'blockedUsers')}</h4>
                <div className="blocked-list polished-blocked-list">
                  {blockedUsers.map((item) => (
                    <div key={item.id} className="blocked-item blocked-row">
                      <div>
                        <strong>{item.displayName}</strong>
                        <span>@{item.username}</span>
                      </div>
                      <button type="button" className="ghost-button compact" onClick={() => unblock(item.id)}>{t(locale, 'unblock')}</button>
                    </div>
                  ))}
                  {!blockedUsers.length && <div className="mini-note">{t(locale, 'emptySearch')}</div>}
                </div>
              </div>
            )}
          </div>
        </div>

        <button className="primary-button wide" disabled={busy} onClick={save}>{t(locale, 'updateProfile')}</button>
      </div>
    </div>
  );
}
