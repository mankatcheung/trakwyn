/**
 * URL rules for markdown the app's model produced (JEF-464), the same as the
 * web app's `lib/safeMarkdownUrl.ts`. Text an attacker controls reaches the
 * model, which can be talked into writing the user's data into a link, so only
 * absolute web and mail URLs are opened. Parsed with patterns rather than
 * `URL`, whose React Native polyfill doesn't implement `hostname`.
 */
const SAFE_URL = /^(?:https?:\/\/[^/?#\s]|mailto:)/i;
const WEB_HOST = /^https?:\/\/(?:[^/?#@]*@)?([^/?#:]+)/i;

export function isSafeMarkdownUrl(url: string): boolean {
  return SAFE_URL.test(url);
}

/**
 * The host a link really goes to, for showing beside its label when the label
 * doesn't already name it. Null for `mailto:` and unsafe URLs.
 */
export function linkHostToShow(href: string, label: string): string | null {
  if (!isSafeMarkdownUrl(href)) return null;
  const host = WEB_HOST.exec(href)?.[1]?.toLowerCase();
  if (!host) return null;
  const lowerLabel = label.toLowerCase();
  if (lowerLabel.includes(host) || lowerLabel.includes(host.replace(/^www\./, ''))) return null;
  return host;
}
