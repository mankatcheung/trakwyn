import { aiCreditsStanding, hostedAiAvailable } from '../aiCredits';

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

describe('hostedAiAvailable (Pro-only in phase 1)', () => {
  it('is on for a plan with credits, or a welcome bonus still unspent', () => {
    expect(hostedAiAvailable(credits(0, 300))).toBe(true);
    expect(hostedAiAvailable(credits(0, 0, 5))).toBe(true);
  });

  it('is off for Free (no credits, no bonus) and when there is no credits object', () => {
    expect(hostedAiAvailable(credits(0, 0, 0))).toBe(false);
    expect(hostedAiAvailable(null)).toBe(false);
    expect(hostedAiAvailable(undefined)).toBe(false);
  });
});
