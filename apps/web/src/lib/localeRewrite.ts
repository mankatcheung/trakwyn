import {
  LOCALE_QUERY_KEY,
  indexedLocale,
  isLocalizedPath,
  localizedPath,
  parseLocalizedPath,
} from '#/lib/localePaths';

/**
 * The router's URL rewrite for localized marketing pages (JEF-653).
 *
 * The public URL carries the language as a path prefix (`/zh-hk/pricing`);
 * inside the router it is the same `/pricing` route with `?locale=zh-HK`, the
 * query the app already understands. So no route file knows about prefixes:
 *
 * - **input** strips the prefix and sets `?locale=`, before routes match.
 * - **output** does the reverse for every URL the router builds, so each
 *   `<Link to="/pricing">` on a Chinese page points at the Chinese page.
 *
 * An unknown prefix (`/xx/pricing`) and a prefix in front of a page that is
 * not localized (`/zh-hk/login`, a guide article) are left alone, so they
 * match nothing and are a 404.
 */
export interface LocaleRewrite {
  input: (ctx: { url: URL }) => URL | undefined;
  output: (ctx: { url: URL }) => URL | undefined;
}

/**
 * The public URL of the page at `location` (the router's internal one) in
 * `locale`, for the language picker to push; nothing when the page is not one
 * that has a URL per locale. `en-GB` has no URLs of its own, so it gets the
 * English path with `?locale=en-GB` to keep it displayed.
 */
export function localizedHref(
  location: { pathname: string; searchStr: string; hash: string },
  locale: string,
): string | undefined {
  if (!isLocalizedPath(location.pathname)) return undefined;
  const params = new URLSearchParams(location.searchStr);
  params.delete(LOCALE_QUERY_KEY);
  const indexed = indexedLocale(locale);
  if (!indexed) params.set(LOCALE_QUERY_KEY, locale);
  const search = params.toString();
  const hash =
    location.hash && !location.hash.startsWith('#') ? `#${location.hash}` : location.hash;
  return `${localizedPath(location.pathname, indexed ?? 'en')}${search ? `?${search}` : ''}${hash}`;
}

/**
 * @param getCurrentLocale the `?locale=` of the page being shown. A link built
 *   without one inherits it, which is what keeps navigation inside a language.
 */
export function createLocaleRewrite(getCurrentLocale: () => unknown): LocaleRewrite {
  return {
    input: ({ url }) => {
      const hit = parseLocalizedPath(url.pathname);
      if (!hit) return undefined;
      const next = new URL(url);
      next.pathname = hit.path;
      next.searchParams.set(LOCALE_QUERY_KEY, hit.locale);
      return next;
    },
    output: ({ url }) => {
      if (!isLocalizedPath(url.pathname)) return undefined;
      const explicit = url.searchParams.get(LOCALE_QUERY_KEY);
      // `en-GB` and anything unknown have no URLs of their own: English pages.
      const locale = indexedLocale(explicit ?? getCurrentLocale()) ?? 'en';
      if (explicit === null && locale === 'en') return undefined;
      const next = new URL(url);
      next.searchParams.delete(LOCALE_QUERY_KEY);
      next.pathname = localizedPath(url.pathname, locale);
      return next;
    },
  };
}
