import { describe, expect, it } from 'vitest';
import { DELETION_DATE_FORMAT } from '#/features/account-deletion/lib/accountDeletion';

describe('DELETION_DATE_FORMAT', () => {
  it('shows the weekday and the day, not the time', () => {
    const text = new Intl.DateTimeFormat('en-US', {
      ...DELETION_DATE_FORMAT,
      timeZone: 'UTC',
    }).format(new Date('2026-11-18T15:45:00Z'));
    expect(text).toBe('Wednesday, November 18, 2026');
  });

  it('follows the reader locale', () => {
    const text = new Intl.DateTimeFormat('en-GB', {
      ...DELETION_DATE_FORMAT,
      timeZone: 'UTC',
    }).format(new Date('2026-11-18T15:45:00Z'));
    expect(text).toContain('18 November 2026');
  });
});
