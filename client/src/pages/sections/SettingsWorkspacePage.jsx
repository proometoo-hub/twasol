import { t } from '../../i18n/strings';

const themes = ['dark', 'light', 'ocean', 'forest', 'dusk'];

export default function SettingsWorkspacePage({ locale, currentUser, blockedUsers, requestNotifications, onOpenProfile, onChangeTheme, themeBusy }) {
  const activeTheme = currentUser?.theme || 'dark';

  return (
    <section className="card minimal-page-card practical-settings-page">
      <div className="minimal-page-head-row">
        <div>
          <strong>{locale === 'ar' ? 'الإعدادات' : 'Settings'}</strong>
          <span>{locale === 'ar' ? 'صفحة مرتبة، مع ثيمات متعددة ومريحة.' : 'A cleaner settings page with multiple comfortable themes.'}</span>
        </div>
      </div>

      <div className="minimal-settings-grid">
        <button type="button" className="minimal-settings-tile" onClick={onOpenProfile}>
          <strong>{t(locale, 'profile')}</strong>
          <span>{currentUser?.displayName}</span>
        </button>
        <button type="button" className="minimal-settings-tile" onClick={requestNotifications}>
          <strong>{t(locale, 'notifications')}</strong>
          <span>{locale === 'ar' ? 'تنبيهات المتصفح' : 'Browser notifications'}</span>
        </button>
        <div className="minimal-settings-tile static">
          <strong>{t(locale, 'blockedUsers')}</strong>
          <span>{blockedUsers.length} {locale === 'ar' ? 'مستخدم' : 'users'}</span>
        </div>
        <div className="minimal-settings-tile static">
          <strong>{t(locale, 'theme')}</strong>
          <span>{t(locale, activeTheme)}</span>
        </div>
      </div>

      <section className="card theme-switcher-card">
        <div className="minimal-page-head-row">
          <div>
            <strong>{locale === 'ar' ? 'الثيمات' : 'Themes'}</strong>
            <span>{locale === 'ar' ? 'اختر ثيمًا مريحًا ومتناسقًا للمشروع كله.' : 'Choose a balanced theme for the whole app.'}</span>
          </div>
        </div>

        <div className="theme-option-grid">
          {themes.map((theme) => (
            <button
              key={theme}
              type="button"
              className={`theme-option-card ${activeTheme === theme ? 'is-active' : ''}`}
              onClick={() => onChangeTheme?.(theme)}
              disabled={themeBusy}
            >
              <div className={`theme-swatch theme-swatch-${theme}`} />
              <strong>{t(locale, theme)}</strong>
              <span>{activeTheme === theme ? (locale === 'ar' ? 'مفعّل الآن' : 'Active now') : (locale === 'ar' ? 'تفعيل' : 'Apply')}</span>
            </button>
          ))}
        </div>
      </section>
    </section>
  );
}
