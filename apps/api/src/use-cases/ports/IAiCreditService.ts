import type { User } from '#src/domain/user/User.js';
import type { AiFeature } from '#src/use-cases/constants.js';

/** What a user has spent of this month's hosted AI credits (JEF-447). */
export interface AiCreditStanding {
  /** Credits spent this UTC month. */
  used: number;
  /** The plan's monthly size, without the welcome bonus. */
  limit: number;
  /** Welcome-bonus credits still unspent; 0 once the welcome window has passed. */
  bonusRemaining: number;
  /** The 1st of next month, UTC. */
  resetsAt: Date;
}

/** Credits taken for one call; `refund` hands them back, at most once. */
export interface AiCreditCharge {
  refund(): Promise<void>;
  /**
   * True when the call was let through past the plan's credits (JEF-448): a
   * Pro user's overflow runs on the `lite` tier, whatever the feature would
   * normally get. Nothing was taken from the counter then.
   */
  overflow?: boolean;
}

export interface IAiCreditService {
  /**
   * Takes the feature's weight from the user's monthly credits, or throws
   * `AiCreditsExhaustedError`. Returns null for a weight of 0 (nothing taken).
   * A Pro user past their credits is not refused but flagged `overflow`, until
   * the month's platform cost reaches `AI_COST_CEILING_MICROS`; that read
   * throws if it fails, so a ceiling that cannot be checked refuses.
   * Called only for a call on the platform's key; own-key calls never reach it.
   */
  charge(userId: string, feature: AiFeature, user?: User | null): Promise<AiCreditCharge | null>;
  /** Where a user stands this month, for billing status and `me`. */
  standing(user: User): AiCreditStanding;
}
