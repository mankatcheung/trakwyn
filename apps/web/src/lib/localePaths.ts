/**
 * Which locales have their own URLs on the marketing site, and how a locale
 * maps to a path (JEF-653).
 *
 * Search engines index a URL, not a visitor's language setting, so the
 * prerendered marketing pages are served once per indexed locale:
 * `/pricing` (English), `/zh-hk/pricing`, `/zh-tw/pricing`, `/zh-cn/pricing`.
 * `en-GB` is a supported UI locale but has no URLs of its own: its text is
 * nearly the same as `en`, so a fifth tree would only look like duplicates.
 *
 * No imports, on purpose: `vite.config.ts` reads this file to build the
 * prerender list, and a config file cannot resolve the `#/` alias.
 */

export const LOCALE_QUERY_KEY = 'locale';

export const INDEXED_LOCALES = ['en', 'zh-HK', 'zh-TW', 'zh-CN'] as const;
export type IndexedLocale = (typeof INDEXED_LOCALES)[number];
type PrefixedLocale = Exclude<IndexedLocale, 'en'>;

/** English lives at the root, so only the other indexed locales have a prefix. */
export const LOCALE_PATH_PREFIX: Readonly<Record<PrefixedLocale, string>> = {
  'zh-HK': 'zh-hk',
  'zh-TW': 'zh-tw',
  'zh-CN': 'zh-cn',
};

/** `og:locale` values (language_TERRITORY, underscore form). */
export const OG_LOCALE: Readonly<Record<IndexedLocale, string>> = {
  en: 'en_US',
  'zh-HK': 'zh_HK',
  'zh-TW': 'zh_TW',
  'zh-CN': 'zh_CN',
};

/**
 * The marketing pages that exist once per indexed locale. Guide articles are
 * left out: they are written in English only, so `/guides/<slug>` has one URL.
 * `marketingSsr.test.ts` holds this list equal to the prerendered pages.
 */
export const LOCALIZED_PATHS: readonly string[] = [
  '/',
  '/features',
  '/features/tracking',
  '/features/ai-assistant',
  '/features/resume-cover-letter',
  '/features/analytics',
  '/pricing',
  '/privacy',
  '/terms',
  '/accessibility',
  '/ai-mcp-setup',
  '/guides',
];

const PREFIX_TO_LOCALE: ReadonlyMap<string, PrefixedLocale> = new Map(
  (Object.entries(LOCALE_PATH_PREFIX) as Array<[PrefixedLocale, string]>).map(
    ([locale, prefix]) => [prefix, locale],
  ),
);

export function indexedLocale(value: unknown): IndexedLocale | undefined {
  return INDEXED_LOCALES.find((locale) => locale === value);
}

function trimTrailingSlash(path: string): string {
  return path.length > 1 && path.endsWith('/') ? path.slice(0, -1) : path;
}

/** Whether `path` (no locale prefix) is a page that has one URL per indexed locale. */
export function isLocalizedPath(path: string): boolean {
  return LOCALIZED_PATHS.includes(trimTrailingSlash(path));
}

/** The public path of `path` in `locale`: `/pricing` → `/zh-hk/pricing`; English is unchanged. */
export function localizedPath(path: string, locale: IndexedLocale): string {
  const clean = trimTrailingSlash(path);
  if (locale === 'en' || !isLocalizedPath(clean)) return clean;
  const prefix = `/${LOCALE_PATH_PREFIX[locale]}`;
  return clean === '/' ? prefix : `${prefix}${clean}`;
}

/**
 * Reads a public pathname such as `/zh-tw/features`. Returns nothing unless
 * it is an indexed locale's prefix in front of a localized page, so
 * `/zh-hk/login` and `/zh-hk/guides/some-guide` stay unmatched (a 404).
 */
export function parseLocalizedPath(
  pathname: string,
): { locale: PrefixedLocale; path: string } | undefined {
  const [, first = '', ...rest] = pathname.split('/');
  const locale = PREFIX_TO_LOCALE.get(first);
  if (!locale) return undefined;
  const path = trimTrailingSlash(`/${rest.join('/')}`);
  return isLocalizedPath(path) ? { locale, path } : undefined;
}

/** The locale a public pathname's prefix names, if it is a localized page. */
export function localeFromPathname(pathname: string): PrefixedLocale | undefined {
  return parseLocalizedPath(pathname)?.locale;
}

/** `/zh-hk/pricing` → `/pricing`; any other pathname is returned unchanged. */
export function stripLocalePrefix(pathname: string): string {
  return parseLocalizedPath(pathname)?.path ?? pathname;
}

/** Every indexed locale's public path for `path`, English first. */
export function localizedAlternates(path: string): Array<{ locale: IndexedLocale; path: string }> {
  return INDEXED_LOCALES.map((locale) => ({ locale, path: localizedPath(path, locale) }));
}

/**
 * Nitro `routeRules` for the prefixed pages. English is listed by hand in
 * `vite.config.ts`; this is every other locale × every localized page.
 */
export function localizedRouteRules(): Record<string, { prerender: true }> {
  const prefixed = INDEXED_LOCALES.filter((locale): locale is PrefixedLocale => locale !== 'en');
  return Object.fromEntries(
    prefixed.flatMap((locale) =>
      LOCALIZED_PATHS.map((path) => [localizedPath(path, locale), { prerender: true as const }]),
    ),
  );
}
