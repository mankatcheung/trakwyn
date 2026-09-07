import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import en from './locales/en';
import enGB from './locales/en-GB';
import zhHK from './locales/zh-HK';
import zhTW from './locales/zh-TW';
import zhCN from './locales/zh-CN';
import { DEFAULT_LANGUAGE } from './config';

export const resources = {
  en,
  'en-GB': enGB,
  'zh-HK': zhHK,
  'zh-TW': zhTW,
  'zh-CN': zhCN,
} as const;

void i18n.use(initReactI18next).init({
  resources,
  lng: DEFAULT_LANGUAGE,
  fallbackLng: DEFAULT_LANGUAGE,
  defaultNS: 'common',
  ns: Object.keys(en),
  interpolation: { escapeValue: false },
  react: { useSuspense: false },
});

export default i18n;
