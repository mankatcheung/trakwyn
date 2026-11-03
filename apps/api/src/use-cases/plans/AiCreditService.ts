import type { User } from '#src/domain/user/User.js';
import { effectivePlan } from '#src/domain/plan/Plan.js';
import {
  AI_COST_CEILING_MICROS,
  AI_CREDITS,
  LLM_USAGE_SOURCE,
  type AiFeature,
} from '#src/use-cases/constants.js';
import {
  AiCreditsExhaustedError,
  NotFoundError,
  PlanRequiredError,
} from '#src/use-cases/errors/DomainError.js';
import type {
  AiCreditCharge,
  AiCreditStanding,
  IAiCreditService,
} from '#src/use-cases/ports/IAiCreditService.js';
import type { IEntitlementService } from '#src/use-cases/ports/IEntitlementService.js';
import type { ILlmUsageEventRepository } from '#src/use-cases/ports/ILlmUsageEventRepository.js';
import type { IUserRepository } from '#src/use-cases/ports/IUserRepository.js';
import { startOfUtcMonth } from '#src/use-cases/shared/tokenLimit.js';

interface Deps {
  userRepository: IUserRepository;
  entitlementService: IEntitlementService;
  llmUsageEventRepository: ILlmUsageEventRepository;
  now: () => Date;
}

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Monthly hosted AI credits (JEF-447).
 *
 * The counter lives on the user row and is reset by the first call of a new
 * UTC month (the reserve is one conditional UPDATE that treats an older
 * period as zero), so nothing has to run at the turn of the month. Credits do
 * not roll over.
 */
export class AiCreditService implements IAiCreditService {
  constructor(private readonly deps: Deps) {}

  async charge(
    userId: string,
    feature: AiFeature,
    hint?: User | null,
  ): Promise<AiCreditCharge | null> {
    const weight = AI_CREDITS.WEIGHTS[feature];
    if (weight <= 0) return null;

    const user = hint ?? (await this.deps.userRepository.findById(userId));
    if (!user) throw new NotFoundError('User');

    // Hosted AI is Pro-only for now, so a plan with no credits is refused with an
    // upgrade prompt rather than "you used your credits" (JEF-451).
    if (this.monthlyLimit(user) <= 0) {
      throw new PlanRequiredError(
        'Trakwyn AI is included with Pro. Upgrade, or add your own API key to use AI for free.',
      );
    }

    const now = this.deps.now();
    const periodStart = startOfUtcMonth(now);
    const limit = this.monthlyLimit(user) + this.welcomeBonus(user, now);
    const reserved = await this.deps.userRepository.reserveAiCredits(
      userId,
      weight,
      limit,
      periodStart,
    );
    if (!reserved) return this.overflow(user, now, periodStart, limit);

    let refunded = false;
    return {
      refund: async () => {
        if (refunded) return;
        refunded = true;
        await this.deps.userRepository.releaseAiCredits(userId, weight, periodStart);
      },
    };
  }

  /**
   * Past the plan's credits. Free is refused. Pro keeps going on the cheap
   * model until its month of platform spend reaches the ceiling (JEF-448); the
   * sum is read from the primary database and a failed read propagates, so the
   * call is refused rather than let through unmetered.
   */
  private async overflow(
    user: User,
    now: Date,
    periodStart: Date,
    limit: number,
  ): Promise<AiCreditCharge> {
    const plan = effectivePlan(user.plan, user.planExpiresAt, now);
    const ceiling = AI_COST_CEILING_MICROS[plan];
    if (ceiling === null) throw new AiCreditsExhaustedError(limit, nextReset(now));

    const spent = await this.deps.llmUsageEventRepository.sumCostMicros(
      user.id,
      periodStart,
      LLM_USAGE_SOURCE.PLATFORM,
    );
    if (spent >= ceiling) throw new AiCreditsExhaustedError(limit, nextReset(now), true);
    return { refund: async () => undefined, overflow: true };
  }

  standing(user: User): AiCreditStanding {
    const now = this.deps.now();
    const periodStart = startOfUtcMonth(now);
    const used =
      user.aiCreditsPeriodStart && user.aiCreditsPeriodStart.getTime() >= periodStart.getTime()
        ? user.aiCreditsUsed
        : 0;
    const limit = this.monthlyLimit(user);
    const bonus = this.welcomeBonus(user, now);
    return {
      used,
      limit,
      // The bonus is spent last: it is what is left above the plan's own size.
      bonusRemaining: bonus > 0 ? Math.min(bonus, Math.max(0, limit + bonus - used)) : 0,
      resetsAt: nextReset(now),
    };
  }

  private monthlyLimit(user: User): number {
    return this.deps.entitlementService.forUser(user).limits.aiCreditsPerMonth;
  }

  private welcomeBonus(user: User, now: Date): number {
    if (this.monthlyLimit(user) <= 0) return 0;
    const endsAt = user.createdAt.getTime() + AI_CREDITS.WELCOME_DAYS * DAY_MS;
    return now.getTime() < endsAt ? AI_CREDITS.WELCOME_BONUS : 0;
  }
}

/** The 1st of the following month, UTC. */
function nextReset(now: Date): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
}
