/* eslint-disable react-refresh/only-export-components -- LocaleProvider and useLocale share one context, and the locale constants/helpers are the provider's own vocabulary; splitting them would scatter one module. */
import i18next from 'i18next';
import LanguageDetector from 'i18next-browser-languagedetector';
import { initReactI18next, I18nextProvider, useTranslation } from 'react-i18next';
import { createContext, use, useEffect, useMemo, useState } from 'react';
import en from '#/i18n/en.json';

export const SUPPORTED_LOCALES = ['en', 'en-GB', 'zh-HK', 'zh-TW', 'zh-CN'] as const;
export type Locale = (typeof SUPPORTED_LOCALES)[number];
export const LOCALE_STORAGE_KEY = 'locale';
export const LOCALE_QUERY_KEY = 'locale';

export const LOCALE_OPTIONS: Array<{ value: Locale; label: string }> = [
  { value: 'en', label: 'English' },
  { value: 'en-GB', label: 'English (United Kingdom)' },
  { value: 'zh-HK', label: '中文（香港）' },
  { value: 'zh-TW', label: '繁體中文（台灣）' },
  { value: 'zh-CN', label: '简体中文' },
];

export function isLocale(value: string | null | undefined): value is Locale {
  return !!value && (SUPPORTED_LOCALES as readonly string[]).includes(value);
}

function normalizeLocale(value: string | undefined): Locale {
  if (isLocale(value)) return value;
  if (value?.startsWith('zh-HK')) return 'zh-HK';
  if (value?.startsWith('zh-TW')) return 'zh-TW';
  if (value?.startsWith('zh')) return 'zh-CN';
  if (value?.startsWith('en-GB')) return 'en-GB';
  return 'en';
}

/**
 * Only English is bundled statically (JEF-167). It's the `fallbackLng`, so it
 * has to be present synchronously — every other locale would otherwise render
 * raw keys for the moment before its bundle arrives. The other four are
 * fetched on demand: shipping all five cost ~74 kB gzipped on every first
 * load, of which any one user needs roughly a fifth.
 *
 * Vite turns each `import()` below into its own chunk, so this map is also
 * what defines the split — keep it exhaustive over `Locale` (minus `en`), or
 * a locale becomes unreachable at runtime.
 */
const localeLoaders: Record<Exclude<Locale, 'en'>, () => Promise<{ default: object }>> = {
  'en-GB': () => import('#/i18n/en-GB.json'),
  'zh-HK': () => import('#/i18n/zh-HK.json'),
  'zh-TW': () => import('#/i18n/zh-TW.json'),
  'zh-CN': () => import('#/i18n/zh-CN.json'),
};

/** Memoized so concurrent callers (initial mount + a fast locale switch) share one fetch. */
const inFlight = new Map<Locale, Promise<void>>();

/**
 * Resolves once `locale`'s translations are registered with i18next.
 * Resolves immediately for English and for anything already loaded.
 *
 * Never rejects: a failed chunk fetch (offline, a stale deploy's hashed
 * filename 404ing) leaves i18next on its English fallback, which is a
 * degraded page rather than a blank one. The failed promise is dropped from
 * the memo map so a later attempt can retry.
 */
export async function ensureLocaleLoaded(locale: Locale): Promise<void> {
  if (locale === 'en') return;
  if (i18next.hasResourceBundle(locale, 'translation')) return;

  const existing = inFlight.get(locale);
  if (existing) return existing;

  const load = localeLoaders[locale]()
    .then((module) => {
      i18next.addResourceBundle(locale, 'translation', module.default, true, true);
    })
    .catch((err: unknown) => {
      inFlight.delete(locale);
      console.error(`[i18n] Failed to load the "${locale}" locale — falling back to English`, err);
    });

  inFlight.set(locale, load);
  return load;
}

/**
 * Resolves the locale without consulting i18next, so it can run before
 * `init()` and start the bundle fetch as early as possible. Mirrors the
 * precedence in LOCALE_INIT_SCRIPT (query → stored → browser) — note that
 * differs from LanguageDetector's configured order, but this has always been
 * the effective precedence, since LocaleProvider's own initial state wins.
 */
function detectLocale(): Locale {
  // The server always renders English: there's no Accept-Language or cookie
  // available to the prerender/SSR pass, so the static marketing pages
  // (.vercel/output/static/*.html) are English HTML by design. A non-English
  // visitor hydrates into their locale via LocaleProvider below — the same
  // brief flash of English the lazy bundle fetch already accepts. Localized
  // SSR would need the locale to become part of the URL; revisit if SEO in
  // non-English markets ever demands it.
  if (typeof window === 'undefined') return 'en';
  try {
    const queryLocale = new URLSearchParams(window.location.search).get(LOCALE_QUERY_KEY);
    return normalizeLocale(
      queryLocale ?? localStorage.getItem(LOCALE_STORAGE_KEY) ?? navigator.languages?.[0],
    );
  } catch {
    return 'en';
  }
}

const detectedLocale = detectLocale();

// Kick the fetch off at module scope rather than waiting for React to mount
// and run an effect — it then overlaps hydration instead of following it, so
// in the common case the bundle has landed before anything renders. Non-en
// users may still see a brief flash of English on a cold cache; that's the
// accepted cost of not blocking first paint on a network round-trip.
void ensureLocaleLoaded(detectedLocale);

void i18next
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources: { en: { translation: en } },
    lng: detectedLocale,
    fallbackLng: 'en',
    supportedLngs: SUPPORTED_LOCALES,
    nonExplicitSupportedLngs: false,
    interpolation: { escapeValue: false },
    detection: {
      order: ['querystring', 'navigator', 'localStorage'],
      lookupQuerystring: LOCALE_QUERY_KEY,
      lookupLocalStorage: LOCALE_STORAGE_KEY,
      caches: ['localStorage'],
    },
  });

function getInitialLocale(): Locale {
  if (typeof window === 'undefined') return normalizeLocale(i18next.language);
  const queryLocale = new URLSearchParams(window.location.search).get(LOCALE_QUERY_KEY);
  return normalizeLocale(
    queryLocale ?? localStorage.getItem(LOCALE_STORAGE_KEY) ?? i18next.language,
  );
}

function writeLocaleToUrl(locale: Locale): void {
  if (typeof window === 'undefined') return;
  const url = new URL(window.location.href);
  url.searchParams.set(LOCALE_QUERY_KEY, locale);
  window.history.replaceState(window.history.state, '', url);
}

/** i18next interpolation values, e.g. `{{count}}`/`{{term}}` placeholders — also drives plural-form selection when `count` is present. */
type TranslateOptions = Record<string, string | number>;

interface LocaleContextValue {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  t: (key: string, options?: TranslateOptions) => string;
  formatDate: (value: Date | string | number, options?: Intl.DateTimeFormatOptions) => string;
  formatNumber: (value: number, options?: Intl.NumberFormatOptions) => string;
}

export function LocaleProvider({ children }: { children: React.ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>(getInitialLocale);
  // Bumped once a lazily-fetched bundle registers, to rebuild the memoized
  // `t` below. Without this the initial render for a non-English locale would
  // stay stuck on English: i18next's language is already correct at that
  // point (init sets `lng` up front), so `changeLanguage` is a no-op and
  // never emits `languageChanged` to trigger a re-render of its own.
  const [resourcesVersion, setResourcesVersion] = useState(0);

  useEffect(() => {
    const handleLanguageChanged = (next: string) => setLocaleState(normalizeLocale(next));
    i18next.on('languageChanged', handleLanguageChanged);
    return () => {
      i18next.off('languageChanged', handleLanguageChanged);
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    void ensureLocaleLoaded(locale).then(() => {
      if (cancelled) return;
      if (i18next.language !== locale) void i18next.changeLanguage(locale);
      setResourcesVersion((v) => v + 1);
    });

    document.documentElement.lang = locale;
    localStorage.setItem(LOCALE_STORAGE_KEY, locale);
    writeLocaleToUrl(locale);

    return () => {
      cancelled = true;
    };
  }, [locale]);

  const value = useMemo<LocaleContextValue>(
    () => ({
      locale,
      setLocale: (next) => {
        writeLocaleToUrl(next);
        // Await the bundle before switching, so the UI never flips to a
        // language whose strings aren't loaded yet (which would render
        // English, then correct itself a moment later).
        void ensureLocaleLoaded(next).then(() => i18next.changeLanguage(next));
      },
      t: (key, options) => String(i18next.getFixedT(locale)(key, options)),
      formatDate: (valueToFormat, options) =>
        new Intl.DateTimeFormat(locale, options).format(
          typeof valueToFormat === 'string' ? new Date(valueToFormat) : valueToFormat,
        ),
      formatNumber: (valueToFormat, options) =>
        new Intl.NumberFormat(locale, options).format(valueToFormat),
    }),
    // resourcesVersion is intentionally a dependency with no direct use in
    // the body: it exists to rebuild `t` after a lazily-loaded bundle lands.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [locale, resourcesVersion],
  );

  return (
    <I18nextProvider i18n={i18next}>
      <LocaleContextBridge value={value}>{children}</LocaleContextBridge>
    </I18nextProvider>
  );
}

// Kept separate so existing component tests can render pages without adding a
// provider while production pages still receive the i18next-backed context.
const LocaleContext = createContext<LocaleContextValue | null>(null);

function LocaleContextBridge({
  value,
  children,
}: {
  value: LocaleContextValue;
  children: React.ReactNode;
}) {
  return <LocaleContext value={value}>{children}</LocaleContext>;
}

export function useLocale(): LocaleContextValue {
  const context = use(LocaleContext);
  const { i18n, t } = useTranslation();
  const locale = normalizeLocale(i18n.language);
  // Memoized so callers can safely put `t`/the returned object in a useEffect
  // dependency array without it changing (and re-firing) on every render.
  const fallback = useMemo<LocaleContextValue>(
    () => ({
      locale,
      setLocale: (next) => void i18n.changeLanguage(next),
      t: (key, options) => String(t(key, options)),
      formatDate: (valueToFormat, options) =>
        new Intl.DateTimeFormat(locale, options).format(
          typeof valueToFormat === 'string' ? new Date(valueToFormat) : valueToFormat,
        ),
      formatNumber: (valueToFormat, options) =>
        new Intl.NumberFormat(locale, options).format(valueToFormat),
    }),
    [locale, i18n, t],
  );
  return context ?? fallback;
}

export const LOCALE_INIT_SCRIPT = `(function(){try{var p=new URLSearchParams(location.search).get('${LOCALE_QUERY_KEY}');var l=p||localStorage.getItem('${LOCALE_STORAGE_KEY}')||((navigator.languages||[])[0])||'en';document.documentElement.lang=l;}catch(e){}})();`;
