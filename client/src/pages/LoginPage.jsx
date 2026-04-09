import { useState } from 'react';
import { post } from '../api/client';
import { useAuth } from '../context/AuthContext';
import { t } from '../i18n/strings';

export default function LoginPage() {
  const { login } = useAuth();
  const [mode, setMode] = useState('login');
  const [locale, setLocale] = useState('ar');
  const [form, setForm] = useState({ identifier: '', password: '', displayName: '', username: '', phone: '', email: '' });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const onSubmit = async (event) => {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      const payload = mode === 'login'
        ? { identifier: form.identifier, password: form.password }
        : {
            phone: form.phone,
            email: form.email,
            password: form.password,
            displayName: form.displayName,
            username: form.username,
          };
      const data = await post(`/api/auth/${mode}`, payload);
      login(data.token, data.user);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const sideDetails = [
    {
      title: locale === 'ar' ? 'مراسلة سريعة' : 'Fast messaging',
      text: locale === 'ar' ? 'الوصول للمحادثات والحالات والمكالمات من تجربة نظيفة وهادئة.' : 'Get to chats, statuses, and calls in a calmer, cleaner flow.',
    },
    {
      title: locale === 'ar' ? 'تصميم مرتب' : 'Organized design',
      text: locale === 'ar' ? 'الواجهة مبنية لتخفيف العجقة وإبقاء كل شيء في مكانه الصحيح.' : 'Built to reduce clutter and keep each feature in its right place.',
    },
    {
      title: locale === 'ar' ? 'قابل للتوسع' : 'Ready to grow',
      text: locale === 'ar' ? 'يمكن تطوير المكالمات والحالات والدردشة فوق نفس البنية بسهولة.' : 'Calls, statuses, and chat can evolve on the same structure easily.',
    },
  ];

  return (
    <div className="auth-shell auth-shell-centered" dir={locale === 'ar' ? 'rtl' : 'ltr'}>
      <div className="auth-centered-layout responsive-auth-layout">
        <aside className="auth-side-panel left card">
          <div className="auth-side-inner">
            <div className="brand-mark">ت</div>
            <div>
              <span className="eyebrow">{t(locale, 'appName')}</span>
              <h1>{t(locale, 'appTagline')}</h1>
              <p>{t(locale, 'welcomeText')}</p>
            </div>
            <div className="auth-side-stack">
              {sideDetails.map((item) => (
                <div key={item.title} className="auth-side-tile">
                  <strong>{item.title}</strong>
                  <span>{item.text}</span>
                </div>
              ))}
            </div>
          </div>
        </aside>

        <section className="auth-card auth-card-centered card">
          <div className="auth-badge">{t(locale, 'appName')}</div>
          <div className="auth-heading-row centered">
            <button type="button" className="ghost-button compact" onClick={() => setLocale((cur) => cur === 'ar' ? 'en' : 'ar')}>
              {locale.toUpperCase()}
            </button>
            <div>
              <h2>{t(locale, mode)}</h2>
              <p className="auth-subtitle">{locale === 'ar' ? 'التسجيل في منتصف الصفحة لراحة أكبر وتركيز أوضح.' : 'The form stays centered for a calmer, clearer entry.'}</p>
            </div>
          </div>

          <div className="auth-tabs segmented">
            <button className={mode === 'login' ? 'is-active' : ''} onClick={() => setMode('login')} type="button">{t(locale, 'login')}</button>
            <button className={mode === 'register' ? 'is-active' : ''} onClick={() => setMode('register')} type="button">{t(locale, 'register')}</button>
          </div>

          <form className="auth-form" onSubmit={onSubmit}>
            {mode === 'register' && (
              <>
                <div className="split-grid two-cols">
                  <label>
                    <span>{t(locale, 'displayName')}</span>
                    <input value={form.displayName} onChange={(e) => setForm({ ...form, displayName: e.target.value })} required />
                  </label>
                  <label>
                    <span>{t(locale, 'username')}</span>
                    <input value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} />
                  </label>
                </div>
                <div className="split-grid two-cols">
                  <label>
                    <span>Phone</span>
                    <input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
                  </label>
                  <label>
                    <span>Email</span>
                    <input value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
                  </label>
                </div>
              </>
            )}

            {mode === 'login' && (
              <label>
                <span>{t(locale, 'identifier')}</span>
                <input value={form.identifier} onChange={(e) => setForm({ ...form, identifier: e.target.value })} required />
              </label>
            )}

            <label>
              <span>{t(locale, 'password')}</span>
              <input type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} required />
            </label>

            {error && <div className="error-box">{error}</div>}

            <button className="primary-button wide" type="submit" disabled={busy}>{busy ? '…' : t(locale, mode)}</button>
            <div className="demo-box">{t(locale, 'adminDemo')}</div>
          </form>
        </section>

        <aside className="auth-side-panel right card">
          <div className="auth-side-inner compact">
            <div className="auth-side-heading">
              <strong>{locale === 'ar' ? 'تفاصيل المنصة' : 'Platform details'}</strong>
              <span>{locale === 'ar' ? 'على جانبي النموذج يبقى المستخدم فاهمًا لما يفعله التطبيق.' : 'The side panels explain the product while the form stays centered.'}</span>
            </div>
            <div className="auth-mini-metrics">
              <div><strong>24h</strong><span>{locale === 'ar' ? 'حالات' : 'Stories'}</span></div>
              <div><strong>1:1</strong><span>{locale === 'ar' ? 'دردشة خاصة' : 'Private chat'}</span></div>
              <div><strong>HD</strong><span>{locale === 'ar' ? 'فيديو' : 'Video'}</span></div>
              <div><strong>Live</strong><span>{locale === 'ar' ? 'تحديث لحظي' : 'Realtime'}</span></div>
            </div>
            <div className="auth-side-quote">
              <strong>{locale === 'ar' ? 'هدف الواجهة' : 'Interface goal'}</strong>
              <span>{locale === 'ar' ? 'تقليل التشتيت، إبقاء المسارات واضحة، وجعل بداية الاستخدام أسهل.' : 'Reduce distraction, keep routes clear, and make the first step easier.'}</span>
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}
