import { effectivePlan } from '#src/domain/plan/Plan.js';
import type { Entitlements, Plan } from '#src/domain/plan/Plan.js';
import type { PlanSource } from '#src/domain/plan/Plan.js';
import { PLAN_FEATURES, PLAN_LIMITS, PLAN_TRIAL } from '#src/use-cases/constants.js';

/**
 * What a plan allows at `now`. Pure: it knows nothing about the enforcement
 * switch (`EntitlementService` applies that) or where the plan came from.
 *
 * An expired pass or trial resolves to the Free entitlements, so the answer
 * changes by itself when time passes and nothing has to run to downgrade a
 * user.
 */
export function resolveEntitlements(
  plan: Plan,
  planExpiresAt: Date | null,
  now: Date,
  planSource: PlanSource | null = null,
): Entitlements {
  const effective = effectivePlan(plan, planExpiresAt, now);
  return {
    plan: effective,
    features: PLAN_FEATURES[effective],
    limits: {
      ...PLAN_LIMITS[effective],
      // A trial has its own, smaller AI budget than Pro (JEF-447).
      ...(effective === 'pro' && planSource === 'trial'
        ? { aiCreditsPerMonth: PLAN_TRIAL.AI_CREDITS }
        : {}),
    },
  };
}
