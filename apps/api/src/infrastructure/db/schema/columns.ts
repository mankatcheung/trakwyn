/**
 * Every timestamp column is `timestamptz(3)` read as a JS `Date`.
 *
 * Millisecond precision matches what the SQLite schema stored (`integer` +
 * `timestamp_ms`) and what a `Date` can hold, so a value round-trips
 * unchanged. A default microsecond `timestamptz` would still read back fine,
 * but a value written by SQL `now()` would carry digits no `Date` can
 * represent, and compare unequal to the same instant written from JS.
 */
export const TIMESTAMP = { mode: 'date', withTimezone: true, precision: 3 } as const;
