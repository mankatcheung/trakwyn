import { describe, expect, it } from 'vitest';
import { makeApplication } from '#src/__tests__/helpers/mocks/jobs.js';
import { isLikelyGhosted } from '#src/use-cases/jobs/applicationStaleness.js';

const now = new Date('2026-08-20T12:00:00Z');

describe('isLikelyGhosted', () => {
  it('flags an old active application with no recent activity', () => {
    const application = makeApplication({
      status: 'applied',
      appliedAt: new Date('2026-07-01T12:00:00Z'),
      updatedAt: new Date('2026-07-01T12:00:00Z'),
    });

    expect(isLikelyGhosted(application, now)).toBe(true);
  });

  it('excludes terminal statuses, recent edits, and recent reminders', () => {
    const base = {
      appliedAt: new Date('2026-07-01T12:00:00Z'),
      updatedAt: new Date('2026-07-01T12:00:00Z'),
    };
    expect(isLikelyGhosted(makeApplication({ ...base, status: 'rejected' }), now)).toBe(false);
    expect(
      isLikelyGhosted(
        makeApplication({
          ...base,
          status: 'applied',
          updatedAt: new Date('2026-08-15T12:00:00Z'),
        }),
        now,
      ),
    ).toBe(false);
    expect(
      isLikelyGhosted(
        makeApplication({
          ...base,
          status: 'interviewing',
          reminderSentAt: new Date('2026-08-15T12:00:00Z'),
        }),
        now,
      ),
    ).toBe(false);
  });
});
