import type { Plan, PlanSource } from '#src/domain/plan/Plan.js';
import { DURATIONS_MS } from '#src/use-cases/constants.js';
import { NotFoundError, ValidationError } from '#src/use-cases/errors/DomainError.js';
import type { IUserRepository } from '#src/use-cases/ports/IUserRepository.js';

interface Deps {
  userRepository: IUserRepository;
  now: () => Date;
}

export interface SetUserPlanInput {
  email: string;
  plan: Plan;
  /** Pro only: end the plan after this many whole days. Omit for no end date. */
  days?: number;
}

export interface SetUserPlanOutput {
  userId: string;
  email: string;
  plan: Plan;
  planSource: PlanSource | null;
  planExpiresAt: Date | null;
}

/**
 * The operator's way to put a user on a plan without a payment: a comp, a
 * partner, a tester. It is recorded as a `grant`, so it is never mistaken for
 * something a payment provider set (JEF-426).
 */
export class SetUserPlanUseCase {
  constructor(private readonly deps: Deps) {}

  async execute(input: SetUserPlanInput): Promise<SetUserPlanOutput> {
    if (input.days !== undefined) {
      if (input.plan === 'free') {
        throw new ValidationError('A Free plan has no end date');
      }
      if (!Number.isInteger(input.days) || input.days < 1) {
        throw new ValidationError('days must be a whole number of at least 1');
      }
    }

    const user = await this.deps.userRepository.findByEmail(input.email);
    if (!user) throw new NotFoundError('User');

    const isPro = input.plan === 'pro';
    const planSource: PlanSource | null = isPro ? 'grant' : null;
    const planExpiresAt =
      isPro && input.days !== undefined
        ? new Date(this.deps.now().getTime() + input.days * DURATIONS_MS.DAY)
        : null;

    await this.deps.userRepository.update(user.id, {
      plan: input.plan,
      planSource,
      planExpiresAt,
    });

    return { userId: user.id, email: user.email, plan: input.plan, planSource, planExpiresAt };
  }
}
