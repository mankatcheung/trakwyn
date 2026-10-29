/**
 * URL rules for markdown the app's model produced (JEF-464). Text an attacker
 * controls (a scraped posting, a pasted JD) reaches the model, which can be
 * talked into writing the user's data into a link or image URL, so only
 * absolute web and mail URLs survive: `javascript:`, `data:`, relative and
 * protocol-relative URLs all become `''`.
 */
const SAFE_PROTOCOLS = new Set(['https:', 'http:', 'mailto:']);

function parseSafe(url: string): URL | null {
  if (!URL.canParse(url)) return null;
  const parsed = new URL(url);
  return SAFE_PROTOCOLS.has(parsed.protocol) ? parsed : null;
}

/** `urlTransform` for `react-markdown`: the URL itself when safe, else `''`. */
export function safeMarkdownUrl(url: string): string {
  return parseSafe(url) ? url : '';
}

/**
 * The host a link really goes to, for showing beside its label when the label
 * doesn't already name it. Null for `mailto:` and unsafe URLs.
 */
export function linkHostToShow(href: string, label: string): string | null {
  const parsed = parseSafe(href);
  if (!parsed || parsed.protocol === 'mailto:') return null;
  const host = parsed.hostname;
  const lowerLabel = label.toLowerCase();
  if (lowerLabel.includes(host) || lowerLabel.includes(host.replace(/^www\./, ''))) return null;
  return host;
}
