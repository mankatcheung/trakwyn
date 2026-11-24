import i18next from 'i18next';
import {
  OG_LOCALE,
  isLocalizedPath,
  localizedAlternates,
  localizedPath,
  type IndexedLocale,
} from '#/lib/localePaths';

/**
 * The `<head>` every marketing page shares (JEF-462): canonical URL, Open
 * Graph and Twitter tags, and the link-preview card. Since JEF-653 the pages
 * exist once per indexed locale, so the head is also where a search engine
 * learns that: each page names itself as canonical and lists its siblings as
 * `hreflang` alternates.
 *
 * The card is `public/og-image.png`, rendered from `og/og-image.svg`. It used
 * to be the 512×512 PWA icon, which WhatsApp blew up into a full-width square
 * above the title; a 1200×630 card with `summary_large_image` is the shape
 * every chat app and social network renders as a landscape preview.
 */
export const SITE_URL = 'https://www.trakwyn.com';
export const SITE_NAME = 'Trakwyn';
export const OG_IMAGE = `${SITE_URL}/og-image.png`;
export const OG_IMAGE_WIDTH = 1200;
export const OG_IMAGE_HEIGHT = 630;
export const OG_IMAGE_ALT = 'Trakwyn — Your job search, organized';

/**
 * A page whose title and description live in the locale bundles as
 * `seo.<key>.title` and `seo.<key>.description`.
 */
export type SeoKey =
  | 'home'
  | 'features'
  | 'tracking'
  | 'aiAssistant'
  | 'resumeCoverLetter'
  | 'analytics'
  | 'pricing'
  | 'guides'
  | 'aiMcpSetup'
  | 'privacy'
  | 'terms'
  | 'accessibility';

export interface SeoText {
  title: string;
  description: string;
}

export type MarketingPage = {
  /** Path from the site root without a locale prefix, e.g. `/pricing`; `/` for the home page. */
  path: string;
} & ({ seo: SeoKey } | SeoText);

export type MetaTag =
  { title: string } | { name: string; content: string } | { property: string; content: string };

export interface LinkTag {
  rel: string;
  href: string;
  /** React's spelling: it renders the `hreflang` attribute, and warns about the lowercase prop. */
  hrefLang?: string;
  /** A `rel="preload"` link: what the resource is, so the browser fetches it with the right priority. */
  as?: string;
  /** Limits a preload to a colour scheme, so a hidden variant is never fetched. */
  media?: string;
  fetchPriority?: 'high' | 'low' | 'auto';
}

/** The absolute URL of a marketing page, without a trailing slash on `/`. */
export function pageUrl(path: string): string {
  return path === '/' ? SITE_URL : `${SITE_URL}${path}`;
}

/** The title and description for `key`, read from `locale`'s bundle (English if it has not loaded). */
export function seoText(key: SeoKey, locale: IndexedLocale): SeoText {
  const t = i18next.getFixedT(locale);
  return {
    title: String(t(`seo.${key}.title`)),
    description: String(t(`seo.${key}.description`)),
  };
}

function resolveText(page: MarketingPage, locale: IndexedLocale): SeoText {
  return 'seo' in page ? seoText(page.seo, locale) : page;
}

/**
 * The canonical link, plus the `hreflang` set when the page exists in every
 * indexed locale. Each locale's page lists all of them, itself included, and
 * `x-default` points at English: Google ignores alternates that do not link
 * back, so the set has to be identical on every page in it.
 */
export function pageLinks(path: string, locale: IndexedLocale): LinkTag[] {
  const links: LinkTag[] = [{ rel: 'canonical', href: pageUrl(localizedPath(path, locale)) }];
  if (!isLocalizedPath(path)) return links;
  const alternates = localizedAlternates(path).map(
    ({ locale: alternate, path: alternatePath }): LinkTag => ({
      rel: 'alternate',
      hrefLang: alternate,
      href: pageUrl(alternatePath),
    }),
  );
  return [
    ...links,
    ...alternates,
    { rel: 'alternate', hrefLang: 'x-default', href: pageUrl(localizedPath(path, 'en')) },
  ];
}

/**
 * `og:locale` only. `og:locale:alternate` would repeat one property, and the
 * router keeps a single meta tag per `name`/`property`, so it would list one
 * locale of three. The language relationship is carried by the `hreflang`
 * links instead, which is what search engines read.
 */
function localeMeta(locale: IndexedLocale): MetaTag[] {
  return [{ property: 'og:locale', content: OG_LOCALE[locale] }];
}

export function marketingMeta(page: MarketingPage, locale: IndexedLocale = 'en'): MetaTag[] {
  const { title, description } = resolveText(page, locale);
  const url = pageUrl(localizedPath(page.path, locale));
  const imageAlt =
    locale === 'en' ? OG_IMAGE_ALT : String(i18next.getFixedT(locale)('seo.ogImageAlt'));
  return [
    { title },
    { name: 'description', content: description },
    { property: 'og:type', content: 'website' },
    { property: 'og:site_name', content: SITE_NAME },
    { property: 'og:url', content: url },
    ...localeMeta(locale),
    { property: 'og:title', content: title },
    { property: 'og:description', content: description },
    { property: 'og:image', content: OG_IMAGE },
    { property: 'og:image:type', content: 'image/png' },
    { property: 'og:image:width', content: String(OG_IMAGE_WIDTH) },
    { property: 'og:image:height', content: String(OG_IMAGE_HEIGHT) },
    { property: 'og:image:alt', content: imageAlt },
    { name: 'twitter:card', content: 'summary_large_image' },
    { name: 'twitter:title', content: title },
    { name: 'twitter:description', content: description },
    { name: 'twitter:image', content: OG_IMAGE },
    { name: 'twitter:image:alt', content: imageAlt },
  ];
}

/**
 * `head()` for a marketing route: its meta tags plus the canonical and hreflang
 * links. `extraLinks` follow them (a hero image preload, JEF-682).
 */
export function marketingHead(
  page: MarketingPage,
  locale: IndexedLocale = 'en',
  extraLinks: readonly LinkTag[] = [],
) {
  return {
    meta: marketingMeta(page, locale),
    links: [...pageLinks(page.path, locale), ...extraLinks],
  };
}

/**
 * `head()` for a legal page: a title and description and the canonical and
 * hreflang links, but no link-preview card (they are not shared as previews).
 */
export function legalHead(page: MarketingPage, locale: IndexedLocale = 'en') {
  const { title, description } = resolveText(page, locale);
  return {
    meta: [{ title }, { name: 'description', content: description }] satisfies MetaTag[],
    links: pageLinks(page.path, locale),
  };
}
