import type { BillingWebhookEvent } from '#src/domain/billing/Billing.js';
import { effectivePlan } from '#src/domain/plan/Plan.js';
import type { User } from '#src/domain/user/User.js';
import { addMonths } from '#src/use-cases/billing/addMonths.js';
import type { IBillingEventRepository } from '#src/use-cases/ports/IBillingEventRepository.js';
import type { IBillingProvider } from '#src/use-cases/ports/IBillingProvider.js';
import type { ILogger } from '#src/use-cases/ports/ILogger.js';
import type { ITransactionManager } from '#src/use-cases/ports/ITransactionManager.js';
import type { IUserRepository } from '#src/use-cases/ports/IUserRepository.js';

interface Deps {
  userRepository: IUserRepository;
  billingEventRepository: IBillingEventRepository;
  billingProvider: IBillingProvider;
  transactionManager: ITransactionManager;
  logger: ILogger;
  now: () => Date;
}

export interface HandleBillingWebhookInput {
  rawBody: Buffer;
  headers: Record<string, string | string[] | undefined>;
}

export type HandleBillingWebhookOutcome = 'applied' | 'duplicate' | 'ignored';

/**
 * Turns a verified provider event into a plan change (JEF-426). The event is
 * recorded in the same transaction as the change, so a failure leaves neither
 * and the provider's retry applies it once; a replay finds the record and does
 * nothing. A bad signature throws `UnauthorizedError` before anything else.
 */
export class HandleBillingWebhookUseCase {
  constructor(private readonly deps: Deps) {}

  async execute(input: HandleBillingWebhookInput): Promise<HandleBillingWebhookOutcome> {
    const event = this.deps.billingProvider.parseWebhook(input.rawBody, input.headers);

    return this.deps.transactionManager.run(async () => {
      const user = await this.findUser(event);
      const isNew = await this.deps.billingEventRepository.tryRecord(event.id, user?.id ?? null);
      if (!isNew) return 'duplicate';
      if (!user || event.kind === 'ignored') {
        if (!user && event.kind !== 'ignored') {
          this.deps.logger.warn('Billing event names no known user', undefined, {
            eventId: event.id,
            kind: event.kind,
          });
        }
        return 'ignored';
      }
      return (await this.apply(user, event)) ? 'applied' : 'ignored';
    });
  }

  private async findUser(event: BillingWebhookEvent): Promise<User | null> {
    if (event.userId) {
      const byId = await this.deps.userRepository.findById(event.userId);
      if (byId) return byId;
    }
    return event.customerId
      ? this.deps.userRepository.findByBillingCustomerId(event.customerId)
      : null;
  }

  /** True when the event changed the user's plan. */
  private async apply(user: User, event: BillingWebhookEvent): Promise<boolean> {
    const now = this.deps.now();
    const customer = event.customerId ?? user.billingCustomerId;

    switch (event.kind) {
      case 'subscription_started':
        await this.deps.userRepository.update(user.id, {
          plan: 'pro',
          planSource: 'subscription',
          planExpiresAt: null,
          billingCustomerId: customer,
          billingSubscriptionId: event.subscriptionId,
        });
        return true;

      case 'pass_purchased': {
        // A pass stacks on a pass that is still running; any other source ends
        // when the pass is bought, so the pass counts from now.
        const stacksOnPass =
          user.planSource === 'pass' &&
          user.planExpiresAt !== null &&
          effectivePlan(user.plan, user.planExpiresAt, now) === 'pro';
        const from = stacksOnPass ? user.planExpiresAt! : now;
        await this.deps.userRepository.update(user.id, {
          plan: 'pro',
          planSource: 'pass',
          planExpiresAt: addMonths(from, event.months),
          billingCustomerId: customer,
          billingSubscriptionId: null,
        });
        return true;
      }

      case 'subscription_cancelled':
        // Only the subscription the user is on. A cancellation of an older one
        // must not shorten a newer plan.
        if (
          user.planSource !== 'subscription' ||
          user.billingSubscriptionId !== event.subscriptionId
        ) {
          return false;
        }
        await this.deps.userRepository.update(user.id, { planExpiresAt: event.endsAt });
        return true;

      case 'payment_reversed': {
        const reverses =
          event.product === 'subscription'
            ? user.planSource === 'subscription' &&
              (event.subscriptionId === null || user.billingSubscriptionId === event.subscriptionId)
            : user.planSource === 'pass';
        if (!reverses) return false;
        await this.deps.userRepository.update(user.id, {
          plan: 'free',
          planSource: null,
          planExpiresAt: null,
          billingSubscriptionId: null,
        });
        return true;
      }

      default:
        return false;
    }
  }
}
