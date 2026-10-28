import {
  ForbiddenError,
  RateLimitedError,
  UnauthorizedError,
} from '#src/use-cases/errors/DomainError.js';
import type { User } from '#src/domain/user/User.js';
import type { IRateLimiter } from '#src/use-cases/ports/IRateLimiter.js';
import type { IUserActionTokenRepository } from '#src/use-cases/ports/IUserActionTokenRepository.js';
import type { IUserRepository } from '#src/use-cases/ports/IUserRepository.js';
import { hashesMatch, hashStepUpCode } from '#src/use-cases/shared/actionTokens.js';

interface Deps {
  userRepository: IUserRepository;
  userActionTokenRepository: IUserActionTokenRepository;
  /** Shared with TOTP step-up, under its own key: one guess budget per kind of code. */
  totpRateLimiter: IRateLimiter;
  now?: () => Date;
}

/**
 * Checks a step-up code from `RequestStepUpCodeUseCase` (JEF-463). Like
 * `ReauthenticateUseCase` it touches no session: the caller re-signs the
 * session's tokens with a fresh `authTime` once this returns.
 *
 * Guesses are rate-limited per account before the code is read, and the code
 * is spent on success, so it cannot be replayed.
 */
export class VerifyStepUpCodeUseCase {
  constructor(private readonly deps: Deps) {}

  async execute(input: { userId: string; code: string }): Promise<User> {
    const user = await this.deps.userRepository.findById(input.userId);
    if (!user) throw new UnauthorizedError('Invalid credentials');
    if (user.passwordHash !== null) {
      throw new ForbiddenError('Confirm with your password instead');
    }

    const allowed = await this.deps.totpRateLimiter.consume(`step-up-code:verify:${user.id}`);
    if (!allowed) {
      throw new RateLimitedError('Too many verification attempts. Please try again later.');
    }

    const now = (this.deps.now ?? (() => new Date()))();
    const token = await this.deps.userActionTokenRepository.findLiveForUser(
      user.id,
      'step_up_code',
      now,
    );
    const code = input.code.trim();
    if (!token || !hashesMatch(token.tokenHash, hashStepUpCode(user.id, code))) {
      throw new UnauthorizedError('Invalid or expired code');
    }
    if (!(await this.deps.userActionTokenRepository.consume(token.id, now))) {
      throw new UnauthorizedError('Invalid or expired code');
    }
    return user;
  }
}
