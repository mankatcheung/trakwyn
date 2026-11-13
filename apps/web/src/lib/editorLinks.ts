/** Schemes a link in a draft may use. Everything else (javascript:, data:, file:) is refused. */
export const ALLOWED_LINK_PROTOCOLS = ['http', 'https', 'mailto'] as const;

const SCHEME = /^([a-z][a-z0-9+.-]*):/i;

/** True when `uri` names one of the allowed schemes. Used by the editor's Link extension. */
export function isAllowedLinkUri(uri: string): boolean {
  const scheme = SCHEME.exec(uri.trim())?.[1]?.toLowerCase();
  return scheme !== undefined && (ALLOWED_LINK_PROTOCOLS as readonly string[]).includes(scheme);
}

/**
 * Turns what a user typed into a link target, or null when it is not allowed.
 * A bare address such as `example.com/jobs` gets `https://`; an address with a
 * scheme must be on the allow list, so `javascript:` is rejected, not rewritten.
 */
export function normalizeLinkInput(input: string): string | null {
  const value = input.trim();
  if (value === '' || /\s/.test(value)) return null;
  if (SCHEME.test(value) && !value.includes('//') && !/^mailto:/i.test(value)) return null;
  if (SCHEME.test(value)) return isAllowedLinkUri(value) ? value : null;
  return `https://${value}`;
}
