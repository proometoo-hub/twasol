import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { supportedLanguages, t as translate } from '../i18n/translations';

const LanguageContext = createContext(null);
const RTL_LANGS = new Set(['ar', 'fa', 'ur']);

export function LanguageProvider({ children }) {
  const [lang, setLang] = useState(() => localStorage.getItem('lang') || 'ar');

  useEffect(() => {
    localStorage.setItem('lang', lang);
    document.documentElement.lang = lang;
    document.documentElement.dir = RTL_LANGS.has(lang) ? 'rtl' : 'ltr';
    document.body.classList.toggle('app-ltr', !RTL_LANGS.has(lang));
  }, [lang]);

  const value = useMemo(() => ({
    lang,
    setLang,
    languages: supportedLanguages,
    isRTL: RTL_LANGS.has(lang),
    t: (key) => translate(key, lang),
  }), [lang]);

  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
}

export function useLanguage() {
  const ctx = useContext(LanguageContext);
  if (!ctx) throw new Error('useLanguage must be used within LanguageProvider');
  return ctx;
}
