import { ServiceUnavailableError, UnauthorizedError } from '#src/use-cases/errors/DomainError.js';
import type { User } from '#src/domain/user/User.js';
import type { IApiTokenRepository } from '#src/use-cases/ports/IApiTokenRepository.js';
import type { IBillingProvider } from '#src/use-cases/ports/IBillingProvider.js';
import type { IEmailService } from '#src/use-cases/ports/IEmailService.js';
import type { ILogger } from '#src/use-cases/ports/ILogger.js';
import type { IMcpOAuthGrantRepository } from '#src/use-cases/ports/IMcpOAuthGrantRepository.js';
import type { IMcpOAuthRefreshTokenRepository } from '#src/use-cases/ports/IMcpOAuthRefreshTokenRepository.js';
import type { IMcpOAuthTokenRepository } from '#src/use-cases/ports/IMcpOAuthTokenRepository.js';
import type { ISecurityEventRepository } from '#src/use-cases/ports/ISecurityEventRepository.js';
import type { ISessionRepository } from '#src/use-cases/ports/ISessionRepository.js';
import type { ITransactionManager } from '#src/use-cases/ports/ITransactionManager.js';
import type { IUserActionTokenRepository } from '#src/use-cases/ports/IUserActionTokenRepository.js';
import type { IUserRepository } from '#src/use-cases/ports/IUserRepository.js';
import { runInTransaction } from '#src/use-cases/runInTransaction.js';
import { ACCOUNT_DELETION, DURATIONS_MS } from '#src/use-cases/constants.js';
import { hashLinkToken, mintLinkToken } from '#src/use-cases/shared/actionTokens.js';

interface Deps {
  userRepository: IUserRepository;
  userActionTokenRepository: IUserActionTokenRepository;
  sessionRepository: ISessionRepository;
  apiTokenRepository: IApiTokenRepository;
  mcpOAuthGrantRepository: IMcpOAuthGrantRepository;
  mcpOAuthTokenRepository: IMcpOAuthTokenRepository;
  mcpOAuthRefreshTokenRepository: IMcpOAuthRefreshTokenRepository;
  securityEventRepository: ISecurityEventRepository;
  billingProvider: IBillingProvider;
  emailService: IEmailService;
  logger: ILogger;
  generateId: () => string;
  webAppOrigin: string;
  transactionManager?: ITransactionManager;
  now?: () => Date;
}

/** What the user is told when the provider will not stop the renewal. */
const SUBSCRIPTION_NOT_STOPPED_MESSAGE =
  'We could not stop your subscription renewing. Try again, or contact support.';

/**
 * The emailed link's target (JEF-463): schedules the account for deletion
 * `ACCOUNT_DELETION.GRACE_PERIOD_DAYS` from now. Needs no session, since the
 * link is the credential and may be opened on another device.
 *
 * In order, so that a failure leaves nothing half done:
 * 1. The subscription is set to end with its paid period. If the provider
 *    refuses, nothing changes and the link still works (JEF-439's rule: never
 *    assume a charge has stopped).
 * 2. In one transaction: the date, a cancel link valid until it, every
 *    session revoked, and the audit event.
 * 3. API tokens and MCP grants revoked, so nothing keeps acting for an
 *    account its owner is closing.
 * 4. The mail, to the primary and a verified backup address. A failed send is
 *    logged, not thrown: the deletion is scheduled either way, and the
 *    "scheduled" screen after sign-in offers the same cancel.
 *
 * Confirming an account that is already scheduled changes nothing and
 * answers with the date already set.
 */
export class ConfirmAccountDeletionUseCase {
  constructor(private readonly deps: Deps) {}

  async execute(input: { token: string }): Promise<{ deletionScheduledAt: Date }> {
    const now = (this.deps.now ?? (() => new Date()))();
    const token = await this.deps.userActionTokenRepository.findByTokenHash(
      'account_deletion_confirm',
      hashLinkToken(input.token),
    );
    if (!token || token.usedAt || token.expiresAt <= now) {
      throw new UnauthorizedError('This link is invalid or has expired');
    }
    const user = await this.deps.userRepository.findById(token.userId);
    if (!user) throw new UnauthorizedError('This link is invalid or has expired');
    if (user.deletionScheduledAt) {
      await this.deps.userActionTokenRepository.consume(token.id, now);
      return { deletionScheduledAt: user.deletionScheduledAt };
    }

    if (user.billingSubscriptionId) {
      try {
        await this.deps.billingProvider.scheduleCancellation(user.billingSubscriptionId);
      } catch (err) {
        this.deps.logger.error('[account deletion] could not schedule the cancellation', err);
        throw new ServiceUnavailableError(SUBSCRIPTION_NOT_STOPPED_MESSAGE);
      }
    }

    const deletionScheduledAt = new Date(
      now.getTime() + ACCOUNT_DELETION.GRACE_PERIOD_DAYS * DURATIONS_MS.DAY,
    );
    const cancelLink = mintLinkToken(ACCOUNT_DELETION.RANDOM_BYTES);
    const consumed = await runInTransaction(this.deps.transactionManager, async () => {
      if (!(await this.deps.userActionTokenRepository.consume(token.id, now))) return false;
      await this.deps.userRepository.update(user.id, { deletionScheduledAt });
      await this.deps.userActionTokenRepository.issue({
        id: this.deps.generateId(),
        userId: user.id,
        purpose: 'account_deletion_cancel',
        tokenHash: cancelLink.hash,
        expiresAt: deletionScheduledAt,
      });
      await this.deps.sessionRepository.revokeAllForUser(user.id);
      await this.deps.securityEventRepository.create({
        id: this.deps.generateId(),
        userId: user.id,
        eventType: 'account_deletion_scheduled',
        ipAddress: null,
        userAgent: null,
      });
      return true;
    });
    if (!consumed) throw new UnauthorizedError('This link is invalid or has expired');

    await this.revokeMachineAccess(user.id, now);
    await this.notify(user, deletionScheduledAt, cancelLink.raw);
    return { deletionScheduledAt };
  }

  private async revokeMachineAccess(userId: string, now: Date): Promise<void> {
    const apiTokens = await this.deps.apiTokenRepository.findAllByUserId(userId);
    for (const apiToken of apiTokens) {
      await this.deps.apiTokenRepository.delete(apiToken.id);
    }
    const grants = await this.deps.mcpOAuthGrantRepository.findActiveByUserId(userId, now);
    for (const grant of grants) {
      await this.deps.mcpOAuthTokenRepository.revokeFamily(grant.id, now);
      await this.deps.mcpOAuthRefreshTokenRepository.revokeFamily(grant.id, now);
    }
  }

  private async notify(user: User, deletionScheduledAt: Date, cancelToken: string): Promise<void> {
    const cancelUrl = `${this.deps.webAppOrigin}/cancel-account-deletion?token=${cancelToken}`;
    const recipients = [user.email];
    if (user.backupEmail && user.backupEmailVerifiedAt) recipients.push(user.backupEmail);
    for (const to of recipients) {
      try {
        await this.deps.emailService.sendAccountDeletionScheduled(
          to,
          deletionScheduledAt,
          cancelUrl,
          user.billingSubscriptionId !== null,
        );
      } catch (err) {
        this.deps.logger.error('[account deletion] could not send the scheduled notice', err);
      }
    }
  }
}
