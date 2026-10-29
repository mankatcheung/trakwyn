import type { User } from '#src/domain/user/User.js';
import type { IBillingProvider } from '#src/use-cases/ports/IBillingProvider.js';
import type { IDocumentRepository } from '#src/use-cases/ports/IDocumentRepository.js';
import type { ILogger } from '#src/use-cases/ports/ILogger.js';
import type { IStorageProvider } from '#src/use-cases/ports/IStorageProvider.js';
import type { IUserRepository } from '#src/use-cases/ports/IUserRepository.js';
import { ACCOUNT_DELETION } from '#src/use-cases/constants.js';

export interface PurgeScheduledAccountsResult {
  purged: number;
  failed: number;
  /** Failed accounts already `ACCOUNT_DELETION.OVERDUE_AFTER_MS` past their date. */
  overdue: number;
}

interface Deps {
  userRepository: IUserRepository;
  documentRepository: IDocumentRepository;
  storageProvider: IStorageProvider;
  billingProvider: IBillingProvider;
  logger: ILogger;
  now: () => Date;
}

/**
 * Deletes every account whose grace period has run out (JEF-463), run daily
 * by `/admin/accounts/purge`. Per account, in an order where a failure leaves
 * the account intact for the next run rather than half gone:
 *
 * 1. The subscription is revoked. It was set to end with its period at
 *    confirmation; this stops it now, before the row that links a charge to
 *    anyone disappears (JEF-439).
 * 2. Every stored file: the documents and the avatar. Once the row cascades
 *    away, their keys go with it and nothing would ever find them again.
 * 3. The user row, which cascades to everything else.
 *
 * One account failing does not stop the rest. One that keeps failing past
 * `OVERDUE_AFTER_MS` is logged as `account_purge.overdue`, which alerts: the
 * owner was promised a date.
 */
export class PurgeScheduledAccountsUseCase {
  constructor(private readonly deps: Deps) {}

  async execute(): Promise<PurgeScheduledAccountsResult> {
    const now = this.deps.now();
    const due = await this.deps.userRepository.findScheduledForDeletionBefore(now);

    let purged = 0;
    let failed = 0;
    let overdue = 0;
    for (const user of due) {
      try {
        await this.purge(user);
        purged += 1;
      } catch (error) {
        failed += 1;
        this.deps.logger.error(`Failed to purge account ${user.id}`, error);
        const scheduledAt = user.deletionScheduledAt?.getTime() ?? now.getTime();
        if (now.getTime() - scheduledAt > ACCOUNT_DELETION.OVERDUE_AFTER_MS) overdue += 1;
      }
    }

    if (overdue > 0) {
      this.deps.logger.warn('Accounts past their deletion date could not be purged', undefined, {
        event: ACCOUNT_DELETION.OVERDUE_EVENT,
        overdue,
      });
    }
    return { purged, failed, overdue };
  }

  private async purge(user: User): Promise<void> {
    if (user.billingSubscriptionId) {
      await this.deps.billingProvider.revokeSubscription(user.billingSubscriptionId);
    }
    const documents = await this.deps.documentRepository.findAllByUserId(user.id);
    const keys = documents.map((doc) => doc.storageKey);
    if (user.avatarKey) keys.push(user.avatarKey);
    await this.deps.storageProvider.deleteMany(keys);
    await this.deps.userRepository.delete(user.id);
  }
}
