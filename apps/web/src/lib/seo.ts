/**
 * The `<head>` every marketing page shares (JEF-462): canonical URL, Open
 * Graph and Twitter tags, and the link-preview card.
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

export interface MarketingPage {
  /** Path from the site root, e.g. `/pricing`; `/` for the home page. */
  path: string;
  title: string;
  description: string;
}

export type MetaTag =
  { title: string } | { name: string; content: string } | { property: string; content: string };

/** The absolute URL of a marketing page, without a trailing slash on `/`. */
export function pageUrl(path: string): string {
  return path === '/' ? SITE_URL : `${SITE_URL}${path}`;
}

export function marketingMeta({ path, title, description }: MarketingPage): MetaTag[] {
  return [
    { title },
    { name: 'description', content: description },
    { property: 'og:type', content: 'website' },
    { property: 'og:site_name', content: SITE_NAME },
    { property: 'og:url', content: pageUrl(path) },
    { property: 'og:title', content: title },
    { property: 'og:description', content: description },
    { property: 'og:image', content: OG_IMAGE },
    { property: 'og:image:type', content: 'image/png' },
    { property: 'og:image:width', content: String(OG_IMAGE_WIDTH) },
    { property: 'og:image:height', content: String(OG_IMAGE_HEIGHT) },
    { property: 'og:image:alt', content: OG_IMAGE_ALT },
    { name: 'twitter:card', content: 'summary_large_image' },
    { name: 'twitter:title', content: title },
    { name: 'twitter:description', content: description },
    { name: 'twitter:image', content: OG_IMAGE },
    { name: 'twitter:image:alt', content: OG_IMAGE_ALT },
  ];
}

/** `head()` for a marketing route: its meta tags plus the canonical link. */
export function marketingHead(page: MarketingPage) {
  return {
    meta: marketingMeta(page),
    links: [{ rel: 'canonical', href: pageUrl(page.path) }],
  };
}
