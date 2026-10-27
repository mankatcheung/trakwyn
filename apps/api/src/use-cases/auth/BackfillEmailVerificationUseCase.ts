import { ValidationError } from '#src/use-cases/errors/DomainError.js';
import type { IUserRepository } from '#src/use-cases/ports/IUserRepository.js';

interface Deps {
  userRepository: IUserRepository;
  now: () => Date;
}

export interface BackfillEmailVerificationInput {
  /** Accounts created strictly before this moment are marked verified. */
  before: Date;
  /** Count what would change without changing anyone. */
  dryRun?: boolean;
}

export interface BackfillEmailVerificationSummary {
  /** Accounts marked verified (or, on a dry run, that would be). */
  verified: number;
  alreadyVerified: number;
  /** Unverified accounts left alone because they were created on or after the cutoff. */
  remaining: number;
}

/**
 * Marks accounts that predate the email-verification wall as verified
 * (JEF-438), so that switching the wall on does not lock out people who signed
 * up before it existed. Run by the operator at that moment, like the launch
 * trial, rather than in a migration.
 *
 * It trusts every address created before the cutoff, including one an attacker
 * registered with a password and never proved. Pick a cutoff the operator
 * believes in; a dry run reports how many accounts each choice would cover.
 * Accounts already verified are skipped, so a second run changes nothing.
 */
export class BackfillEmailVerificationUseCase {
  constructor(private readonly deps: Deps) {}

  async execute(input: BackfillEmailVerificationInput): Promise<BackfillEmailVerificationSummary> {
    if (Number.isNaN(input.before.getTime())) {
      throw new ValidationError('before must be a valid date');
    }

    const verifiedAt = this.deps.now();
    const users = await this.deps.userRepository.findAll();

    let verified = 0;
    let alreadyVerified = 0;
    let remaining = 0;
    for (const user of users) {
      if (user.emailVerifiedAt) {
        alreadyVerified++;
      } else if (user.createdAt < input.before) {
        if (!input.dryRun) {
          await this.deps.userRepository.update(user.id, { emailVerifiedAt: verifiedAt });
        }
        verified++;
      } else {
        remaining++;
      }
    }

    return { verified, alreadyVerified, remaining };
  }
}
