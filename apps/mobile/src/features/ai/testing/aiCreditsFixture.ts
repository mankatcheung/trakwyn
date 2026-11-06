import type { UseAiCredits } from '../hooks/useAiCredits';

/** What `costOf` answers in the tests: the API's per-feature costs, never copied into app code. */
export const FIXTURE_COSTS: Record<string, number> = {
  mockQuestions: 1,
  mockAnswer: 2,
  talkingPoints: 3,
  companyBriefing: 4,
  resumeMatch: 1,
};

/** A user on their own key: no credit lines, nothing disabled. */
export function ownKeyCredits(over: Partial<UseAiCredits> = {}): UseAiCredits {
  return {
    onTrakwynAi: false,
    needsSetup: false,
    standing: null,
    resetsAt: null,
    costOf: () => null,
    canAfford: () => true,
    refresh: jest.fn().mockResolvedValue(undefined),
    ...over,
  };
}

/** A user on Trakwyn AI with 12 of 30 credits left. */
export function trakwynCredits(over: Partial<UseAiCredits> = {}): UseAiCredits {
  return ownKeyCredits({
    onTrakwynAi: true,
    standing: { left: 12, total: 30, ratio: 0.6, nearing: false, exhausted: false },
    resetsAt: '2026-12-01T00:00:00.000Z',
    costOf: (feature) => FIXTURE_COSTS[feature] ?? null,
    ...over,
  });
}

/** A user on Trakwyn AI whose month is spent. */
export function exhaustedCredits(over: Partial<UseAiCredits> = {}): UseAiCredits {
  return trakwynCredits({
    standing: { left: 0, total: 30, ratio: 1, nearing: false, exhausted: true },
    canAfford: () => false,
    ...over,
  });
}
