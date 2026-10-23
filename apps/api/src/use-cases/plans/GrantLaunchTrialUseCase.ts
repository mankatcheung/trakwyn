import { DURATIONS_MS, PLAN_TRIAL } from '#src/use-cases/constants.js';
import { ValidationError } from '#src/use-cases/errors/DomainError.js';
import type { IUserRepository } from '#src/use-cases/ports/IUserRepository.js';

interface Deps {
  userRepository: IUserRepository;
  now: () => Date;
}

export interface GrantLaunchTrialInput {
  /** Whole days of Pro to give. Defaults to `PLAN_TRIAL.LAUNCH_DAYS`. */
  days?: number;
  /** Count who would get a trial without changing anyone. */
  dryRun?: boolean;
}

export interface GrantLaunchTrialSummary {
  granted: number;
  skipped: number;
  /** When every trial granted by this run ends. */
  endsAt: Date;
}

/**
 * Gives every existing user a Pro trial, once, on the day plans start being
 * enforced (JEF-344). Run by the operator at that moment rather than in a
 * migration, so the 30 days start when users can actually feel the change.
 *
 * Anyone who has ever had a plan (a trial, a pass, a subscription, a grant) is
 * skipped, so a second run grants nothing twice and nobody who already paid is
 * handed a free month on top.
 */
export class GrantLaunchTrialUseCase {
  constructor(private readonly deps: Deps) {}

  async execute(input: GrantLaunchTrialInput): Promise<GrantLaunchTrialSummary> {
    const days = input.days ?? PLAN_TRIAL.LAUNCH_DAYS;
    if (!Number.isInteger(days) || days < 1) {
      throw new ValidationError('days must be a whole number of at least 1');
    }

    const endsAt = new Date(this.deps.now().getTime() + days * DURATIONS_MS.DAY);
    const users = await this.deps.userRepository.findAll();

    let granted = 0;
    let skipped = 0;
    for (const user of users) {
      if (user.plan !== 'free' || user.planSource !== null) {
        skipped++;
        continue;
      }
      if (!input.dryRun) {
        await this.deps.userRepository.update(user.id, {
          plan: 'pro',
          planSource: 'trial',
          planExpiresAt: endsAt,
        });
      }
      granted++;
    }

    return { granted, skipped, endsAt };
  }
}
