import { COMPANY_SEARCH } from '#src/infrastructure/config/constants.js';

/**
 * The company name as it goes into a search query and a cache key: one line,
 * no quotes or control characters (so a name cannot add operators to the
 * query), cut at `MAX_COMPANY_CHARS`. Case is kept for the query; the key
 * lowercases it. `null` when nothing is left.
 */
export function cleanCompanyName(company: string): string | null {
  const cleaned = company
    .replace(/[\p{Cc}"]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, COMPANY_SEARCH.MAX_COMPANY_CHARS)
    .trim();
  return cleaned || null;
}

/** A cache-key-safe form of the cleaned name: lowercase letters, digits and hyphens. */
export function companyKeySegment(cleaned: string): string {
  const segment = cleaned
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, '-')
    .replace(/^-+|-+$/g, '');
  return segment || 'company';
}
