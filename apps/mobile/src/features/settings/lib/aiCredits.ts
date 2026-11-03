import type { AiCredits } from '../types';

/** Above this share of the credits the meter warns rather than just reports (JEF-451). */
export const NEARING_CREDITS_RATIO = 0.8;

export interface AiCreditsStanding {
  /** Credits left this month, welcome bonus included. */
  left: number;
  /** The month's size, welcome bonus included. */
  total: number;
  /** 0 to 1, clamped. */
  ratio: number;
  nearing: boolean;
  exhausted: boolean;
}

/** `limit` is the plan's size without the bonus; `bonusRemaining` is what is left above it. */
export function aiCreditsStanding(credits: AiCredits): AiCreditsStanding {
  const total = credits.limit + credits.bonusRemaining;
  const left = Math.max(0, total - credits.used);
  const ratio = total > 0 ? Math.min(1, credits.used / total) : 1;
  return {
    left,
    total,
    ratio,
    nearing: ratio >= NEARING_CREDITS_RATIO && left > 0,
    exhausted: left === 0,
  };
}
