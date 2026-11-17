import { useCallback, useState } from 'react';
import type { Locale } from '#/lib/i18n';

/**
 * The language a draft is spell-checked in (JEF-579). It is the `lang` of the
 * editing area, so the browser's own dictionary does the checking: no document
 * text leaves the app. The names are written in their own language, as in any
 * language picker, so they are not translated.
 */
export const DOCUMENT_LANGUAGES = [
  { tag: 'en-US', label: 'English (US)' },
  { tag: 'en-GB', label: 'English (UK)' },
  { tag: 'zh-CN', label: '简体中文' },
  { tag: 'zh-TW', label: '繁體中文（台灣）' },
  { tag: 'zh-HK', label: '繁體中文（香港）' },
  { tag: 'es', label: 'Español' },
  { tag: 'fr', label: 'Français' },
  { tag: 'de', label: 'Deutsch' },
] as const;

export type DocumentLanguageTag = (typeof DOCUMENT_LANGUAGES)[number]['tag'];

export function isDocumentLanguage(value: unknown): value is DocumentLanguageTag {
  return DOCUMENT_LANGUAGES.some((language) => language.tag === value);
}

/** The app's own language is the default: `en` is American English, the rest map one to one. */
export function documentLanguageForLocale(locale: Locale): DocumentLanguageTag {
  return locale === 'en' ? 'en-US' : locale;
}

const storageKey = (draftId: string) => `documentLanguage:${draftId}`;

/** The language chosen for this draft on this browser, or null. Storage can be blocked, so every access is guarded. */
export function readDocumentLanguage(draftId: string): DocumentLanguageTag | null {
  try {
    const stored = window.localStorage.getItem(storageKey(draftId));
    return isDocumentLanguage(stored) ? stored : null;
  } catch {
    return null;
  }
}

export function writeDocumentLanguage(draftId: string, tag: DocumentLanguageTag): void {
  try {
    window.localStorage.setItem(storageKey(draftId), tag);
  } catch {
    // Private window or blocked storage: the choice lasts until the page closes.
  }
}

/**
 * The draft's language: the one chosen here before, otherwise the app's. It is
 * kept per draft in this browser, not on the draft, so it needs no migration.
 */
export function useDocumentLanguage(
  draftId: string,
  locale: Locale,
): [DocumentLanguageTag, (tag: DocumentLanguageTag) => void] {
  const [chosen, setChosen] = useState<DocumentLanguageTag | null>(() =>
    readDocumentLanguage(draftId),
  );
  const choose = useCallback(
    (tag: DocumentLanguageTag) => {
      setChosen(tag);
      writeDocumentLanguage(draftId, tag);
    },
    [draftId],
  );
  return [chosen ?? documentLanguageForLocale(locale), choose];
}
