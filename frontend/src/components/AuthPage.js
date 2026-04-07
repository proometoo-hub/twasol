import React, { useState } from 'react';
import { MessageSquare } from 'lucide-react';
import api from '../api';
import { useAuth } from '../context/AuthContext';
import { useLanguage } from '../context/LanguageContext';

export default function AuthPage() {
  const { login } = useAuth();
  const { t } = useLanguage();
  const [isRegister, setIsRegister] = useState(false);
  const [form, setForm] = useState({ name: '', email: '', password: '' });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const pendingInvite = localStorage.getItem('pendingInviteCode');

  const handleSubmit = async () => {
    setError('');
    if (!form.email || !form.password || (isRegister && !form.name)) { setError(t('allFieldsRequired')); return; }
    setLoading(true);
    try {
      const res = await api.post(isRegister ? '/auth/register' : '/auth/login', { name: form.name, email: form.email, password: form.password });
      if (res.data.user && res.data.token) login(res.data.user, res.data.token);
    } catch (err) { setError(err.response?.data?.error || t('connectionError')); }
    finally { setLoading(false); }
  };

  const onKey = (e) => { if (e.key === 'Enter') handleSubmit(); };

  return (
    <div className="auth-bg">
      <div className="auth-card">
        <div className="logo"><MessageSquare size={48} color="#00a884" /></div>
        <h1>{t('appName')}</h1>
        <p className="subtitle">{isRegister ? t('registerSub') : t('loginWelcome')}</p>
        {pendingInvite && <div style={{ background: 'rgba(0,168,132,.1)', color: '#00a884', borderRadius: 10, padding: 10, fontSize: 13, marginBottom: 10 }}>{t('pendingInviteSaved')}</div>}
        {error && <div className="auth-error">{error}</div>}
        {isRegister && <input className="auth-input" placeholder={t('fullName')} value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} onKeyDown={onKey} />}
        <input className="auth-input" placeholder={t('email')} type="email" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} onKeyDown={onKey} />
        <input className="auth-input" placeholder={t('password')} type="password" value={form.password} onChange={e => setForm({ ...form, password: e.target.value })} onKeyDown={onKey} />
        <button className="auth-btn" onClick={handleSubmit} disabled={loading}>{loading ? '...' : (isRegister ? t('register') : t('login'))}</button>
        <p className="auth-toggle">{isRegister ? `${t('alreadyHaveAccount')} ` : `${t('noAccount')} `}<span onClick={() => { setIsRegister(!isRegister); setError(''); }}>{isRegister ? t('login') : t('register')}</span></p>
      </div>
    </div>
  );
}
