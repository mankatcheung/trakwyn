import {
  ForbiddenError,
  NotFoundError,
  RateLimitedError,
  ServiceUnavailableError,
} from '#src/use-cases/errors/DomainError.js';
import type { IEmailService } from '#src/use-cases/ports/IEmailService.js';
import type { ILogger } from '#src/use-cases/ports/ILogger.js';
import type { IRateLimiter } from '#src/use-cases/ports/IRateLimiter.js';
import type { IUserActionTokenRepository } from '#src/use-cases/ports/IUserActionTokenRepository.js';
import type { IUserRepository } from '#src/use-cases/ports/IUserRepository.js';
import { STEP_UP_CODE } from '#src/use-cases/constants.js';
import { hashStepUpCode, mintNumericCode } from '#src/use-cases/shared/actionTokens.js';

interface Deps {
  userRepository: IUserRepository;
  userActionTokenRepository: IUserActionTokenRepository;
  emailService: IEmailService;
  stepUpCodeRateLimiter: IRateLimiter;
  logger: ILogger;
  generateId: () => string;
  now?: () => Date;
}

/**
 * Mails a 6-digit code to an account with no password, so it can step up for
 * a sensitive change (JEF-463). Whoever reads the inbox can already take the
 * account through a password reset, so the code adds no new way in.
 *
 * Refused for an account with a password: it steps up with that, and a code
 * must not become a way around it.
 */
export class RequestStepUpCodeUseCase {
  constructor(private readonly deps: Deps) {}

  async execute(userId: string): Promise<void> {
    const user = await this.deps.userRepository.findById(userId);
    if (!user) throw new NotFoundError('User not found');
    if (user.passwordHash !== null) {
      throw new ForbiddenError('Confirm with your password instead');
    }

    const allowed = await this.deps.stepUpCodeRateLimiter.consume(`step-up-code:user:${user.id}`);
    if (!allowed) {
      throw new RateLimitedError('Too many codes requested. Try again later.');
    }

    const now = (this.deps.now ?? (() => new Date()))();
    const code = mintNumericCode(STEP_UP_CODE.DIGITS);
    await this.deps.userActionTokenRepository.issue({
      id: this.deps.generateId(),
      userId: user.id,
      purpose: 'step_up_code',
      tokenHash: hashStepUpCode(user.id, code),
      expiresAt: new Date(now.getTime() + STEP_UP_CODE.TTL_MS),
    });

    try {
      await this.deps.emailService.sendStepUpCode(user.email, code);
    } catch (err) {
      // The user is signed in and asked for this, so unlike a password reset
      // there is nothing to hide: say it did not arrive.
      this.deps.logger.error('[step-up] could not send the code', err);
      throw new ServiceUnavailableError('We could not send the code. Try again shortly.');
    }
  }
}
