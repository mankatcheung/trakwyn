// Mirrors apps/web's SUPPORTED_LOCALES/LOCALE_OPTIONS (apps/web/src/lib/i18n.tsx)
// so mobile and web always offer the same language set.
export type LanguageCode = 'en' | 'en-GB' | 'zh-HK' | 'zh-TW' | 'zh-CN';
export type LanguageMode = LanguageCode | 'system';

export interface LanguageOption {
  code: LanguageCode;
  label: string;
  nativeLabel: string;
}

export const SUPPORTED_LANGUAGES: LanguageOption[] = [
  { code: 'en', label: 'English', nativeLabel: 'English' },
  { code: 'en-GB', label: 'English (United Kingdom)', nativeLabel: 'English (United Kingdom)' },
  { code: 'zh-HK', label: '中文（香港）', nativeLabel: '中文（香港）' },
  { code: 'zh-TW', label: '繁體中文（台灣）', nativeLabel: '繁體中文（台灣）' },
  { code: 'zh-CN', label: '简体中文', nativeLabel: '简体中文' },
];

export const DEFAULT_LANGUAGE: LanguageCode = 'en';

export function isSupportedLanguage(code: string): code is LanguageCode {
  return SUPPORTED_LANGUAGES.some((language) => language.code === code);
}
