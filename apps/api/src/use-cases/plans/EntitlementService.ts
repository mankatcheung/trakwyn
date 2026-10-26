import type { Entitlements, PlanFeature } from '#src/domain/plan/Plan.js';
import type { User } from '#src/domain/user/User.js';
import { PLAN_FEATURES, PLAN_LIMITS } from '#src/use-cases/constants.js';
import { NotFoundError, PlanRequiredError } from '#src/use-cases/errors/DomainError.js';
import type { IEntitlementService } from '#src/use-cases/ports/IEntitlementService.js';
import type { IUserRepository } from '#src/use-cases/ports/IUserRepository.js';
import { resolveEntitlements } from '#src/use-cases/plans/resolveEntitlements.js';

interface Deps {
  userRepository: IUserRepository;
  /** `PLANS_ENFORCED`. Off until payment exists (JEF-426), and always off when self-hosted. */
  plansEnforced: boolean;
  now: () => Date;
}

/**
 * What an instance that does not enforce plans gives everyone: every Pro
 * feature, but the per-user caps the system already
 * enforced before plans existed (JEF-425's 100 MB, the application count).
 * Lifting those would loosen a deployed system the moment this ships, with
 * nothing in return, so "not enforced" turns features on and leaves the
 * existing caps where they were.
 */
const UNENFORCED: Entitlements = {
  plan: 'pro',
  features: PLAN_FEATURES.pro,
  limits: {
    applications: PLAN_LIMITS.free.applications,
    documentBytes: PLAN_LIMITS.free.documentBytes,
  },
};

const FEATURE_LABEL: Record<PlanFeature, string> = {
  notifications: 'Reminders, digests and push notifications',
  analytics: 'Analytics',
  offers: 'Offer tools',
  shareLinks: 'Share links',
  apiAccess: 'API access with a token',
  mcpAccess: 'MCP access',
};

export class EntitlementService implements IEntitlementService {
  constructor(private readonly deps: Deps) {}

  get enforced(): boolean {
    return this.deps.plansEnforced;
  }

  forUser(user: Pick<User, 'plan' | 'planExpiresAt'>): Entitlements {
    if (!this.deps.plansEnforced) return UNENFORCED;
    return resolveEntitlements(user.plan, user.planExpiresAt, this.deps.now());
  }

  async forUserId(userId: string): Promise<Entitlements> {
    const user = await this.deps.userRepository.findById(userId);
    if (!user) throw new NotFoundError('User');
    return this.forUser(user);
  }

  async assertFeature(userId: string, feature: PlanFeature): Promise<void> {
    const entitlements = await this.forUserId(userId);
    if (!entitlements.features[feature]) {
      throw new PlanRequiredError(`${FEATURE_LABEL[feature]} is a Pro feature`);
    }
  }
}
