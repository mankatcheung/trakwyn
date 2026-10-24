import { describe, expect, it } from 'vitest';
import { addMonths } from '#src/use-cases/billing/addMonths.js';

describe('addMonths', () => {
  it('adds whole calendar months', () => {
    expect(addMonths(new Date('2026-01-15T10:00:00Z'), 3).toISOString()).toBe(
      '2026-04-15T10:00:00.000Z',
    );
  });

  it('clamps to the last day of a shorter month', () => {
    expect(addMonths(new Date('2026-08-31T00:00:00Z'), 6).toISOString()).toBe(
      '2027-02-28T00:00:00.000Z',
    );
  });

  it('does not change its input', () => {
    const from = new Date('2026-01-31T00:00:00Z');
    addMonths(from, 1);
    expect(from.toISOString()).toBe('2026-01-31T00:00:00.000Z');
  });
});
