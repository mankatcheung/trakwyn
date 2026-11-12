/*
 * Text helpers for checking that generated text is grounded in what the user
 * supplied. Shared by the cover letter guard (JEF-558) and the eval matchers
 * (JEF-546, JEF-548), so both compare text the same way. Use cases must not
 * import from `evals/`, which is why these live here.
 */

/**
 * NFKC, every Unicode space separator as one plain space, hyphen and dash
 * variants (U+2010 to U+2014) as "-", then lowercase. Used on the text and the
 * needle alike, so a phrase matches however the model spaced or hyphenated it.
 */
export const normaliseText = (value: string | null): string =>
  (value ?? '')
    .normalize('NFKC')
    .replace(/\p{Zs}+/gu, ' ')
    .replace(/[‐-—]/g, '-')
    .toLowerCase();

const EMAIL_PATTERN = /[a-z0-9._%+-]+@[a-z0-9-]+(?:\.[a-z0-9-]+)+/g;
const URL_PATTERN = /https?:\/\/[^\s<>"'`)\]]+/g;
/**
 * Top-level domains a bare "evil.example" is recognised by. Short on purpose:
 * "Node.js" and "ASP.NET" are technologies, not links, so `js` and `net` are
 * not here (a URL or an email with them is still found).
 */
const BARE_DOMAIN_TLDS = 'com|org|io|co|dev|app|ai|example|invalid|test|xyz|info|biz|uk|de|ca';
const BARE_DOMAIN_PATTERN = new RegExp(`\\b(?:[a-z0-9-]+\\.)+(?:${BARE_DOMAIN_TLDS})\\b`, 'g');

const withoutWww = (host: string): string => host.replace(/^www\./, '');

function hostOf(url: string): string {
  try {
    return withoutWww(new URL(url).hostname);
  } catch {
    return withoutWww(url.replace(/^https?:\/\//, '').split(/[/?#]/)[0] ?? url);
  }
}

/**
 * Every address and host named in the text, lowercased: an email as the whole
 * address, a URL or a bare domain as its host without "www.". A reply that
 * quotes "https://stripe.com/jobs/1" as "stripe.com" is the same link.
 */
export function linksIn(value: string | null): string[] {
  const text = normaliseText(value);
  const emails = text.match(EMAIL_PATTERN) ?? [];
  const withoutEmails = text.replace(EMAIL_PATTERN, ' ');
  const urls = withoutEmails.match(URL_PATTERN) ?? [];
  const withoutUrls = withoutEmails.replace(URL_PATTERN, ' ');
  const domains = (withoutUrls.match(BARE_DOMAIN_PATTERN) ?? []).map(withoutWww);
  return [...new Set([...emails, ...urls.map(hostOf), ...domains])];
}
