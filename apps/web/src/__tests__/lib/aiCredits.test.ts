import { describe, it, expect } from 'vitest';
import { aiCreditsView, isLowOnCredits } from '#/lib/aiCredits';

const credits = (used: number, limit = 30, bonusRemaining = 0) => ({
  used,
  limit,
  bonusRemaining,
  resetsAt: '2026-12-01T00:00:00.000Z',
});

describe('aiCreditsView', () => {
  it('returns null when the API sent no credits', () => {
    expect(aiCreditsView(undefined)).toBeNull();
  });

  it('returns null for a plan with no credits, so Free shows no meter (JEF-451)', () => {
    expect(aiCreditsView(credits(0, 0, 0))).toBeNull();
  });

  it('counts what is left of the plan size', () => {
    expect(aiCreditsView(credits(18))).toMatchObject({ left: 12, total: 30, level: 'ok' });
  });

  it('adds the welcome bonus while it lasts', () => {
    expect(aiCreditsView(credits(10, 30, 20))).toMatchObject({ left: 40, total: 50 });
  });

  it('spends the bonus last: past the plan size only the bonus is left', () => {
    expect(aiCreditsView(credits(40, 30, 10))).toMatchObject({ left: 10, total: 50 });
  });

  it('warns from 80% used and reports empty at 100%', () => {
    expect(aiCreditsView(credits(24))?.level).toBe('warning');
    expect(aiCreditsView(credits(30))).toMatchObject({ left: 0, level: 'empty' });
  });
});

describe('isLowOnCredits', () => {
  it('is true only below 30% left', () => {
    expect(isLowOnCredits(aiCreditsView(credits(20)))).toBe(false); // 10 of 30 = 33%
    expect(isLowOnCredits(aiCreditsView(credits(22)))).toBe(true); // 8 of 30 = 27%
    expect(isLowOnCredits(null)).toBe(false);
  });
});
