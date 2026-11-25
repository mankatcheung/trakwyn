/**
 * The three date styles the app shows (JEF-693). Everything the browser's own
 * `toLocaleDateString()` printed, as `11/25/2026` or `11/25/2026, 9:04:55 PM`, goes
 * through here instead, so one kind of date reads one way on every screen.
 *
 * - a day: "Nov 25" in the current year, "Nov 25, 2025" in any other
 * - a day and time, to the minute and never the second: "Nov 25, 7:03 PM"
 * - a time: "7:03 PM"
 *
 * The locale is the UI's, so a Chinese or British interface gets its own order and clock.
 * A value that is not a date gives an empty string rather than "Invalid Date".
 */
export type DateInput = Date | string | number | null | undefined;

const DAY: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric' };
const TIME: Intl.DateTimeFormatOptions = { hour: 'numeric', minute: '2-digit' };

function toDate(value: DateInput): Date | null {
  if (value === null || value === undefined) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

/** Only a year other than this one is worth the room. */
function dayOptions(date: Date, now: Date): Intl.DateTimeFormatOptions {
  return date.getFullYear() === now.getFullYear() ? DAY : { ...DAY, year: 'numeric' };
}

export function formatDay(value: DateInput, locale: string, now: Date = new Date()): string {
  const date = toDate(value);
  return date ? new Intl.DateTimeFormat(locale, dayOptions(date, now)).format(date) : '';
}

export function formatDateTime(value: DateInput, locale: string, now: Date = new Date()): string {
  const date = toDate(value);
  if (!date) return '';
  return new Intl.DateTimeFormat(locale, { ...dayOptions(date, now), ...TIME }).format(date);
}

export function formatTime(value: DateInput, locale: string): string {
  const date = toDate(value);
  return date ? new Intl.DateTimeFormat(locale, TIME).format(date) : '';
}
