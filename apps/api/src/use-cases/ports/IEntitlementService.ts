import type { Entitlements, PlanFeature } from '#src/domain/plan/Plan.js';
import type { User } from '#src/domain/user/User.js';

/**
 * The one place that answers "what may this user do". Every plan check goes
 * through it, so the enforcement switch (`PLANS_ENFORCED`) is read once here
 * and no use case has to know it exists.
 */
export interface IEntitlementService {
  /** Whether plans are enforced. When false every user gets every feature. */
  readonly enforced: boolean;
  /** For a user row the caller already holds, so no second read. */
  forUser(user: Pick<User, 'plan' | 'planExpiresAt'>): Entitlements;
  /** Loads the user first. Fails with `NotFoundError` if they are gone. */
  forUserId(userId: string): Promise<Entitlements>;
  /** Fails with `PlanRequiredError` unless the user's plan includes `feature`. */
  assertFeature(userId: string, feature: PlanFeature): Promise<void>;
}
