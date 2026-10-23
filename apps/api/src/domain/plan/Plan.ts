/** What a user is on. `free` is the default; `pro` is paid, granted, or a trial. */
export type Plan = 'free' | 'pro';

/**
 * How the plan was obtained. `subscription` and `pass` are set by the payment
 * provider (JEF-426); `trial` and `grant` are set by the operator.
 */
export type PlanSource = 'subscription' | 'pass' | 'trial' | 'grant';

/** The Pro-only capabilities that are switched on or off as a whole. */
export type PlanFeature = 'notifications' | 'analytics' | 'offers' | 'shareLinks' | 'apiAccess';

/**
 * Everything a plan allows, resolved for one user at one instant.
 *
 * `limits.applications` and `limits.aiActionsPerMonth` are `null` for "no
 * limit". `documentBytes` is always a number: nobody gets unlimited storage.
 */
export interface Entitlements {
  /** The plan in force now: a Pro plan whose expiry has passed reads as `free`. */
  plan: Plan;
  features: Readonly<Record<PlanFeature, boolean>>;
  limits: {
    applications: number | null;
    documentBytes: number;
    aiActionsPerMonth: number | null;
  };
}

/**
 * The plan in force at `now`. A paid plan with an expiry (a pass or a trial)
 * falls back to `free` from that instant; no expiry means it is still running
 * (an active subscription). Data is never touched: only what the plan allows.
 */
export function effectivePlan(plan: Plan, planExpiresAt: Date | null, now: Date): Plan {
  if (plan === 'free') return 'free';
  if (planExpiresAt !== null && planExpiresAt.getTime() <= now.getTime()) return 'free';
  return plan;
}
