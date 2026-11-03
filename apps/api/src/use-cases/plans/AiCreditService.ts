import type { User } from '#src/domain/user/User.js';
import { AI_CREDITS, type AiFeature } from '#src/use-cases/constants.js';
import { AiCreditsExhaustedError, NotFoundError } from '#src/use-cases/errors/DomainError.js';
import type {
  AiCreditCharge,
  AiCreditStanding,
  IAiCreditService,
} from '#src/use-cases/ports/IAiCreditService.js';
import type { IEntitlementService } from '#src/use-cases/ports/IEntitlementService.js';
import type { IUserRepository } from '#src/use-cases/ports/IUserRepository.js';
import { startOfUtcMonth } from '#src/use-cases/shared/tokenLimit.js';

interface Deps {
  userRepository: IUserRepository;
  entitlementService: IEntitlementService;
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

    const now = this.deps.now();
    const periodStart = startOfUtcMonth(now);
    const limit = this.monthlyLimit(user) + this.welcomeBonus(user, now);
    const reserved = await this.deps.userRepository.reserveAiCredits(
      userId,
      weight,
      limit,
      periodStart,
    );
    if (!reserved) throw new AiCreditsExhaustedError(limit, nextReset(now));

    let refunded = false;
    return {
      refund: async () => {
        if (refunded) return;
        refunded = true;
        await this.deps.userRepository.releaseAiCredits(userId, weight, periodStart);
      },
    };
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
    const endsAt = user.createdAt.getTime() + AI_CREDITS.WELCOME_DAYS * DAY_MS;
    return now.getTime() < endsAt ? AI_CREDITS.WELCOME_BONUS : 0;
  }
}

/** The 1st of the following month, UTC. */
function nextReset(now: Date): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
}
