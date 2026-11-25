import { describe, expect, it } from 'vitest';
import { appSourceFiles, matchingLines } from '../helpers/sourceFiles';

/**
 * Dates reach the screen through `lib/dates.ts` or `useLocale().formatDate` (JEF-693).
 * The browser's own `toLocaleDateString()` and `toLocaleString()` print `11/25/2026`
 * and `11/25/2026, 9:04:55 PM`, to the second, in the browser's language rather than
 * the UI's, so four date styles had grown across the app. Numbers may still call
 * `toLocaleString()`; only a date does not.
 */
const BARE_DATE_FORMAT = /\.toLocale(?:Date|Time)String\(|new Date\([^)]*\)\.toLocaleString\(/;

describe('no bare date formatting (JEF-693)', () => {
  const files = appSourceFiles();

  it('reads the source of both packages', () => {
    expect(files.length).toBeGreaterThan(200);
  });

  it('formats every date through lib/dates or useLocale().formatDate', () => {
    expect(matchingLines(files, BARE_DATE_FORMAT)).toEqual([]);
  });
});
