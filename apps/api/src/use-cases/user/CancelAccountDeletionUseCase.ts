import { UnauthorizedError } from '#src/use-cases/errors/DomainError.js';
import type { User } from '#src/domain/user/User.js';
import type { IBillingProvider } from '#src/use-cases/ports/IBillingProvider.js';
import type { IEmailService } from '#src/use-cases/ports/IEmailService.js';
import type { ILogger } from '#src/use-cases/ports/ILogger.js';
import type { ISecurityEventRepository } from '#src/use-cases/ports/ISecurityEventRepository.js';
import type { IUserActionTokenRepository } from '#src/use-cases/ports/IUserActionTokenRepository.js';
import type { IUserRepository } from '#src/use-cases/ports/IUserRepository.js';
import { hashLinkToken } from '#src/use-cases/shared/actionTokens.js';

/** A signed-in user cancelling, or anyone holding the link from the "scheduled" mail. */
export type CancelAccountDeletionInput = { userId: string } | { token: string };

interface Deps {
  userRepository: IUserRepository;
  userActionTokenRepository: IUserActionTokenRepository;
  securityEventRepository: ISecurityEventRepository;
  billingProvider: IBillingProvider;
  emailService: IEmailService;
  logger: ILogger;
  generateId: () => string;
  now?: () => Date;
}

/**
 * Stops a scheduled deletion (JEF-463). Signing in never does this on its
 * own: the owner chooses to, from the app or from the mailed link.
 *
 * The link works without signing in and creates no session: cancelling only
 * keeps the account, so a stolen link can do no harm beyond that, and the
 * "cancelled" mail tells the owner it happened.
 *
 * The subscription is set to renew again on a best-effort basis: if the
 * provider cannot be reached the account is still kept, and the owner can
 * resume it from the billing portal, which beats losing the account over a
 * payment outage.
 */
export class CancelAccountDeletionUseCase {
  constructor(private readonly deps: Deps) {}

  async execute(input: CancelAccountDeletionInput): Promise<void> {
    const user = await this.resolveUser(input);
    if (!user?.deletionScheduledAt) return;

    await this.deps.userRepository.update(user.id, { deletionScheduledAt: null });
    await this.deps.userActionTokenRepository.deleteForUser(user.id, 'account_deletion_cancel');
    await this.deps.securityEventRepository.create({
      id: this.deps.generateId(),
      userId: user.id,
      eventType: 'account_deletion_cancelled',
      ipAddress: null,
      userAgent: null,
    });

    if (user.billingSubscriptionId) {
      try {
        await this.deps.billingProvider.resumeSubscription(user.billingSubscriptionId);
      } catch (err) {
        this.deps.logger.error('[account deletion] could not resume the subscription', err);
      }
    }
    try {
      await this.deps.emailService.sendAccountDeletionCancelled(user.email);
    } catch (err) {
      this.deps.logger.error('[account deletion] could not send the cancelled notice', err);
    }
  }

  private async resolveUser(input: CancelAccountDeletionInput): Promise<User | null> {
    if ('userId' in input) return this.deps.userRepository.findById(input.userId);

    const now = (this.deps.now ?? (() => new Date()))();
    const token = await this.deps.userActionTokenRepository.findByTokenHash(
      'account_deletion_cancel',
      hashLinkToken(input.token),
    );
    if (!token || token.usedAt || token.expiresAt <= now) {
      throw new UnauthorizedError('This link is invalid or has expired');
    }
    return this.deps.userRepository.findById(token.userId);
  }
}
