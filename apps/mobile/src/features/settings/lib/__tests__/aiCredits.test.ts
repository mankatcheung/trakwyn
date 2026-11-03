import { aiCreditsStanding } from '../aiCredits';

const credits = (used: number, limit = 30, bonusRemaining = 0) => ({
  used,
  limit,
  bonusRemaining,
  resetsAt: '2026-12-01T00:00:00.000Z',
});

describe('aiCreditsStanding', () => {
  it('counts what is left out of the month, bonus included', () => {
    expect(aiCreditsStanding(credits(18))).toMatchObject({ left: 12, total: 30, exhausted: false });
    expect(aiCreditsStanding(credits(18, 30, 20))).toMatchObject({ left: 32, total: 50 });
  });

  it('warns from 80% and not before', () => {
    expect(aiCreditsStanding(credits(23)).nearing).toBe(false);
    expect(aiCreditsStanding(credits(24)).nearing).toBe(true);
  });

  it('is exhausted at the limit, never negative, and no longer "nearing"', () => {
    expect(aiCreditsStanding(credits(35))).toMatchObject({
      left: 0,
      ratio: 1,
      exhausted: true,
      nearing: false,
    });
  });
});
