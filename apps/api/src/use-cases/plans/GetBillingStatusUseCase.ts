import { effectivePlan } from '#src/domain/plan/Plan.js';
import type { Entitlements, Plan, PlanSource } from '#src/domain/plan/Plan.js';
import { NotFoundError } from '#src/use-cases/errors/DomainError.js';
import type { IEntitlementService } from '#src/use-cases/ports/IEntitlementService.js';
import type { IUserRepository } from '#src/use-cases/ports/IUserRepository.js';
import { resolveEntitlements } from '#src/use-cases/plans/resolveEntitlements.js';

interface Deps {
  userRepository: IUserRepository;
  entitlementService: IEntitlementService;
  now: () => Date;
}

export interface GetBillingStatusInput {
  userId: string;
}

/** What one plan includes: its features and limits. */
export type PlanTerms = Pick<Entitlements, 'features' | 'limits'>;

/** Everything a client needs to show where a user stands against their plan. */
export interface BillingStatus {
  /** False when the instance does not enforce plans; every feature is then on. */
  enforced: boolean;
  /** The plan the user is on now: an expired Pro plan reads as `free`. */
  plan: Plan;
  planExpiresAt: Date | null;
  planSource: PlanSource | null;
  features: Entitlements['features'];
  limits: Entitlements['limits'];
  /** Both plans side by side, for a comparison. Independent of the user's plan and of enforcement. */
  catalogue: { free: PlanTerms; pro: PlanTerms };
  usage: {
    applications: number;
    documentBytes: number;
  };
}

function termsOf(plan: Plan, now: Date): PlanTerms {
  const { features, limits } = resolveEntitlements(plan, null, now);
  return { features, limits };
}

export class GetBillingStatusUseCase {
  constructor(private readonly deps: Deps) {}

  async execute(input: GetBillingStatusInput): Promise<BillingStatus> {
    const user = await this.deps.userRepository.findById(input.userId);
    if (!user) throw new NotFoundError('User');

    const now = this.deps.now();
    const entitlements = this.deps.entitlementService.forUser(user);

    return {
      enforced: this.deps.entitlementService.enforced,
      plan: effectivePlan(user.plan, user.planExpiresAt, now),
      planExpiresAt: user.planExpiresAt,
      planSource: user.planSource,
      features: entitlements.features,
      limits: entitlements.limits,
      catalogue: { free: termsOf('free', now), pro: termsOf('pro', now) },
      usage: {
        applications: user.applicationCount,
        documentBytes: user.documentBytes,
      },
    };
  }
}
