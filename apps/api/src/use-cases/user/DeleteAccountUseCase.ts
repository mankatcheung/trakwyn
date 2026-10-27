import {
  NotFoundError,
  ServiceUnavailableError,
  StepUpRequiredError,
  UnauthorizedError,
} from '#src/use-cases/errors/DomainError.js';
import bcrypt from 'bcryptjs';
import type { IBillingProvider } from '#src/use-cases/ports/IBillingProvider.js';
import type { ILogger } from '#src/use-cases/ports/ILogger.js';
import type { IUserRepository } from '#src/use-cases/ports/IUserRepository.js';
import type { IDocumentRepository } from '#src/use-cases/ports/IDocumentRepository.js';
import type { IStorageProvider } from '#src/use-cases/ports/IStorageProvider.js';
import { assertHasPassword } from '#src/use-cases/auth/passwordHashGuard.js';
import { isSessionFresh } from '#src/use-cases/auth/sessionFreshness.js';
import type {
  IDeleteAccountUseCase,
  DeleteAccountInput,
} from '#src/use-cases/user/IDeleteAccountUseCase.js';

interface Deps {
  userRepository: IUserRepository;
  documentRepository: IDocumentRepository;
  storageProvider: IStorageProvider;
  billingProvider: IBillingProvider;
  logger: ILogger;
}

/** What the user is told when we cannot stop their subscription. */
const SUBSCRIPTION_NOT_CANCELLED_MESSAGE =
  'We could not cancel your subscription. Try again, or contact support.';

export class DeleteAccountUseCase implements IDeleteAccountUseCase {
  constructor(private readonly deps: Deps) {}

  async execute(input: DeleteAccountInput): Promise<void> {
    const user = await this.deps.userRepository.findById(input.userId);
    if (!user) throw new NotFoundError('User not found');
    assertHasPassword(user.passwordHash);

    const valid = await bcrypt.compare(input.password, user.passwordHash);
    if (!valid) throw new UnauthorizedError('Invalid password');

    if (user.totpEnabled && !isSessionFresh(input.authTime)) {
      throw new StepUpRequiredError('Please verify your identity again to continue.');
    }

    // The subscription first (JEF-439): the payment provider keeps charging until it is told
    // to stop, and once the user row is gone nothing links a charge to anyone. If it cannot
    // be stopped, nothing is deleted and the user can try again.
    if (user.billingSubscriptionId) {
      await this.revokeSubscription(user.billingSubscriptionId);
    }

    // Blobs before rows, same as PermanentlyDeleteApplicationUseCase: once
    // the user row cascades away, the documents' storage keys go with it,
    // and nothing would ever notice the orphaned files left behind.
    const documents = await this.deps.documentRepository.findAllByUserId(input.userId);
    await this.deps.storageProvider.deleteMany(documents.map((doc) => doc.storageKey));

    await this.deps.userRepository.delete(input.userId);
  }

  private async revokeSubscription(subscriptionId: string): Promise<void> {
    try {
      await this.deps.billingProvider.revokeSubscription(subscriptionId);
    } catch (err) {
      // The provider's own error stays in the log; the user gets a plain message.
      this.deps.logger.error('[account deletion] could not revoke the subscription', err);
      throw new ServiceUnavailableError(SUBSCRIPTION_NOT_CANCELLED_MESSAGE);
    }
  }
}
