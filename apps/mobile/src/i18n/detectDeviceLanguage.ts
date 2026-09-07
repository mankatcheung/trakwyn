import * as Localization from 'expo-localization';
import { DEFAULT_LANGUAGE, isSupportedLanguage, type LanguageCode } from './config';

// Mirrors apps/web's normalizeLocale (apps/web/src/lib/i18n.tsx): a device
// locale tag is matched to one of our five supported codes rather than
// requiring an exact match, since "zh-Hant-HK"/"en-US"/etc. are what
// platforms actually report.
function normalizeToSupported(tag: string | null | undefined): LanguageCode | null {
  if (!tag) return null;
  if (isSupportedLanguage(tag)) return tag;
  if (tag.startsWith('zh-Hant-HK') || tag.startsWith('zh-HK')) return 'zh-HK';
  if (tag.startsWith('zh-Hant-TW') || tag.startsWith('zh-TW') || tag.startsWith('zh-Hant')) {
    return 'zh-TW';
  }
  if (tag.startsWith('zh')) return 'zh-CN';
  if (tag.startsWith('en-GB')) return 'en-GB';
  if (tag.startsWith('en')) return 'en';
  return null;
}

export function detectDeviceLanguage(): LanguageCode {
  for (const locale of Localization.getLocales()) {
    const match =
      normalizeToSupported(locale.languageTag) ?? normalizeToSupported(locale.languageCode);
    if (match) return match;
  }
  return DEFAULT_LANGUAGE;
}
