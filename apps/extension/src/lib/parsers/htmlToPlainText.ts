/**
 * Plain text of an HTML fragment from a page's JSON-LD (JEF-482). Parsed with
 * DOMParser into an inert document (no scripts run, nothing loads), then read
 * back as text, so no tag survives however it is nested or malformed.
 */
export function htmlToPlainText(html: string | undefined): string | undefined {
  if (!html) return undefined;
  return new DOMParser().parseFromString(html, 'text/html').body.textContent ?? undefined;
}
