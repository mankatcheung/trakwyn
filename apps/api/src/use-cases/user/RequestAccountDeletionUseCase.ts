import {
  ConflictError,
  ForbiddenError,
  NotFoundError,
  RateLimitedError,
  ServiceUnavailableError,
  StepUpRequiredError,
} from '#src/use-cases/errors/DomainError.js';
import type { IEmailService } from '#src/use-cases/ports/IEmailService.js';
import type { ILogger } from '#src/use-cases/ports/ILogger.js';
import type { IRateLimiter } from '#src/use-cases/ports/IRateLimiter.js';
import type { IUserActionTokenRepository } from '#src/use-cases/ports/IUserActionTokenRepository.js';
import type { IUserRepository } from '#src/use-cases/ports/IUserRepository.js';
import { confirmIdentity } from '#src/use-cases/auth/confirmIdentity.js';
import { isSessionFresh } from '#src/use-cases/auth/sessionFreshness.js';
import { ACCOUNT_DELETION } from '#src/use-cases/constants.js';
import { mintLinkToken } from '#src/use-cases/shared/actionTokens.js';

export interface RequestAccountDeletionInput {
  userId: string;
  /** See `isSessionFresh`: null is an API token, undefined a pre-JEF-44 session. */
  authTime: number | null | undefined;
  /**
   * Only from the deprecated `deleteAccount(password)` that shipped app
   * versions still call: the password then stands in for the fresh session,
   * as it did before. Every current client steps up instead.
   */
  legacyPassword?: string;
}

interface Deps {
  userRepository: IUserRepository;
  userActionTokenRepository: IUserActionTokenRepository;
  emailService: IEmailService;
  accountDeletionRateLimiter: IRateLimiter;
  logger: ILogger;
  generateId: () => string;
  webAppOrigin: string;
  now?: () => Date;
}

/**
 * The first of three steps to delete an account (JEF-463): prove it is the
 * owner, then mail a link. Nothing changes until that link is used
 * (`ConfirmAccountDeletionUseCase`), and even then the account is only
 * scheduled for deletion, with a grace period to cancel.
 *
 * A fresh session is required from everyone, not only TOTP accounts, so a
 * session left open on a shared computer cannot start this; an account with
 * no password gets one through an OAuth or mailed-code step-up. An API token
 * is refused: it has no session to be fresh.
 */
export class RequestAccountDeletionUseCase {
  constructor(private readonly deps: Deps) {}

  async execute(input: RequestAccountDeletionInput): Promise<void> {
    const user = await this.deps.userRepository.findById(input.userId);
    if (!user) throw new NotFoundError('User not found');
    if (user.deletionScheduledAt) {
      throw new ConflictError('This account is already scheduled for deletion');
    }

    if (input.legacyPassword !== undefined) {
      await confirmIdentity(user, {
        currentPassword: input.legacyPassword,
        authTime: input.authTime,
      });
    } else if (input.authTime === null) {
      throw new ForbiddenError('Sign in to Trakwyn to delete your account');
    } else if (!isSessionFresh(input.authTime)) {
      throw new StepUpRequiredError('Please verify your identity again to continue.');
    }

    const allowed = await this.deps.accountDeletionRateLimiter.consume(
      `account-deletion:user:${user.id}`,
    );
    if (!allowed) {
      throw new RateLimitedError('Too many deletion requests. Try again later.');
    }

    const now = (this.deps.now ?? (() => new Date()))();
    const { raw, hash } = mintLinkToken(ACCOUNT_DELETION.RANDOM_BYTES);
    await this.deps.userActionTokenRepository.issue({
      id: this.deps.generateId(),
      userId: user.id,
      purpose: 'account_deletion_confirm',
      tokenHash: hash,
      expiresAt: new Date(now.getTime() + ACCOUNT_DELETION.CONFIRM_TTL_MS),
    });

    const confirmUrl = `${this.deps.webAppOrigin}/confirm-account-deletion?token=${raw}`;
    try {
      await this.deps.emailService.sendAccountDeletionConfirmation(user.email, confirmUrl);
    } catch (err) {
      this.deps.logger.error('[account deletion] could not send the confirmation link', err);
      throw new ServiceUnavailableError(
        'We could not send the confirmation email. Try again shortly.',
      );
    }
  }
}
