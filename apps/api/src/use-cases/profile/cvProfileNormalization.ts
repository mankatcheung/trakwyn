import { CV_IMPORT } from '#src/use-cases/constants.js';

/**
 * Pure helpers that turn what a model wrote about a CV into values the
 * profile can hold (JEF-461). The model's output is untrusted: a date can be
 * a number, a season or a sentence, and a field can run on for pages.
 */

// 2020, 2020-3, 2020-03, 2020/03, 2020-03-15 or an ISO timestamp; the day is ignored.
const DATE_PATTERN = /^(\d{4})(?:[-/](\d{1,2}))?(?:[-/]\d{1,2})?(?:[T ].*)?$/;

const STILL_HELD_PATTERN = /^(present|current|currently|now|ongoing|to date|today|till date)$/i;

/** `YYYY-MM`, or null when the value is not a date this app can hold. */
export function normalizeCvDate(value: unknown): string | null {
  if (typeof value !== 'string' && typeof value !== 'number') return null;
  const match = DATE_PATTERN.exec(String(value).trim());
  if (!match) return null;

  const year = Number(match[1]);
  const month = match[2] === undefined ? 1 : Number(match[2]);
  if (year < CV_IMPORT.MIN_YEAR || year > CV_IMPORT.MAX_YEAR) return null;
  if (month < 1 || month > 12) return null;
  return `${match[1]}-${String(month).padStart(2, '0')}`;
}

/** True for "Present", "Current" and the like, which mean the role or course is not over. */
export function isStillHeld(value: unknown): boolean {
  return typeof value === 'string' && STILL_HELD_PATTERN.test(value.trim());
}

/**
 * An end date the profile can hold: null for "Present", for anything that is
 * not a date, and for one before the start (a model swapping the two). The
 * entry keeps its other fields; a missing end is the safer mistake.
 */
export function normalizeCvEndDate(value: unknown, startDate: string): string | null {
  if (isStillHeld(value)) return null;
  const end = normalizeCvDate(value);
  return end !== null && end >= startDate ? end : null;
}

/** Trimmed and clipped to `maxChars`; null when nothing is left. */
export function cleanText(value: string | null | undefined, maxChars: number): string | null {
  const text = value?.trim().slice(0, maxChars).trim();
  return text ? text : null;
}

/** One of `CV_IMPORT.PROFICIENCY_LEVELS`, lower-cased, or null for any other wording. */
export function normalizeProficiency(value: string | null | undefined): string | null {
  const level = value?.trim().toLowerCase() ?? '';
  return (CV_IMPORT.PROFICIENCY_LEVELS as readonly string[]).includes(level) ? level : null;
}

/** Case- and whitespace-insensitive key, so "ACME corp " matches "Acme Corp". */
export function matchKey(...parts: Array<string | null | undefined>): string {
  return parts.map((part) => (part ?? '').trim().toLowerCase()).join('\u0000');
}

/** The first entry for each key, in order. */
export function uniqueBy<T>(items: readonly T[], keyOf: (item: T) => string): T[] {
  const seen = new Set<string>();
  return items.filter((item) => {
    const key = keyOf(item);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/** The `YYYY-MM` of a stored date, in UTC like the dates the import writes. */
export function monthOf(date: Date): string {
  return date.toISOString().slice(0, 7);
}
