import { describe, it, expect } from 'vitest';
import { formatDay, formatDateTime, formatTime } from '#/lib/dates';

// Built from local parts, so the expectations hold in any time zone.
const NOW = new Date(2026, 10, 25, 12, 0, 0);
const THIS_YEAR = new Date(2026, 2, 3, 19, 3, 41);
const LAST_YEAR = new Date(2025, 10, 25, 7, 5, 9);

describe('formatDay (JEF-693)', () => {
  it('drops the year within the current year', () => {
    expect(formatDay(THIS_YEAR, 'en', NOW)).toBe('Mar 3');
  });

  it('names the year for any other year', () => {
    expect(formatDay(LAST_YEAR, 'en', NOW)).toBe('Nov 25, 2025');
    expect(formatDay(new Date(2027, 0, 2), 'en', NOW)).toBe('Jan 2, 2027');
  });

  it('is never the numeric 11/25/2026 form', () => {
    expect(formatDay(NOW, 'en', NOW)).not.toMatch(/\d\/\d/);
  });

  it('accepts an ISO string or a timestamp', () => {
    expect(formatDay(THIS_YEAR.toISOString(), 'en', NOW)).toBe('Mar 3');
    expect(formatDay(THIS_YEAR.getTime(), 'en', NOW)).toBe('Mar 3');
  });

  it('follows the UI locale', () => {
    expect(formatDay(THIS_YEAR, 'en-GB', NOW)).toBe('3 Mar');
    expect(formatDay(THIS_YEAR, 'zh-CN', NOW)).toBe('3月3日');
  });

  it('is empty, not "Invalid Date", for a value that is not a date', () => {
    expect(formatDay('not a date', 'en', NOW)).toBe('');
    expect(formatDay(undefined, 'en', NOW)).toBe('');
    expect(formatDay(null, 'en', NOW)).toBe('');
  });
});

describe('formatDateTime (JEF-693)', () => {
  it('adds the time to the minute, never the second', () => {
    expect(formatDateTime(THIS_YEAR, 'en', NOW)).toBe('Mar 3, 7:03 PM');
    expect(formatDateTime(LAST_YEAR, 'en', NOW)).toBe('Nov 25, 2025, 7:05 AM');
    expect(formatDateTime(THIS_YEAR, 'en', NOW)).not.toMatch(/:\d\d:\d\d/);
  });

  it('uses the 24-hour clock where the locale does', () => {
    expect(formatDateTime(THIS_YEAR, 'en-GB', NOW)).toBe('3 Mar, 19:03');
  });

  it('is empty for a value that is not a date', () => {
    expect(formatDateTime('nope', 'en', NOW)).toBe('');
  });
});

describe('formatTime (JEF-693)', () => {
  it('is the time to the minute', () => {
    expect(formatTime(THIS_YEAR, 'en')).toBe('7:03 PM');
    expect(formatTime(THIS_YEAR, 'en-GB')).toBe('19:03');
  });
});
