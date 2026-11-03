import type { AiCredits } from '#/lib/billingStatus';

/** The assistant mentions credits only below this share left, to avoid nagging (JEF-451). */
export const LOW_CREDITS_FRACTION = 0.3;
/** The settings meter turns amber from this share used. */
export const CREDITS_WARNING_FRACTION = 0.8;

export interface AiCreditsView {
  left: number;
  /** What the month holds: spent plus left, bonus included. */
  total: number;
  /** `ok` below 80% used, `warning` from 80%, `empty` at 100%. */
  level: 'ok' | 'warning' | 'empty';
  resetsAt: string;
}

/**
 * Credits left, from the API's standing. The welcome bonus is spent last, so
 * once the plan's own size is used up only the bonus remains.
 */
export function aiCreditsView(credits: AiCredits | undefined | null): AiCreditsView | null {
  if (!credits) return null;
  const left =
    credits.used <= credits.limit
      ? credits.limit - credits.used + credits.bonusRemaining
      : credits.bonusRemaining;
  const total = credits.used + left;
  const usedShare = total === 0 ? 1 : credits.used / total;
  const level = left <= 0 ? 'empty' : usedShare >= CREDITS_WARNING_FRACTION ? 'warning' : 'ok';
  return { left, total, level, resetsAt: credits.resetsAt };
}

/** True when the assistant should show the "N of M left" hint. */
export function isLowOnCredits(view: AiCreditsView | null): boolean {
  return view !== null && view.total > 0 && view.left / view.total < LOW_CREDITS_FRACTION;
}
