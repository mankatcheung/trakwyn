import { effectivePlan } from '#src/domain/plan/Plan.js';
import type { BillingProduct, CheckoutPlan } from '#src/domain/billing/Billing.js';
import { BILLING, DURATIONS_MS } from '#src/use-cases/constants.js';
import { ConflictError, NotFoundError } from '#src/use-cases/errors/DomainError.js';
import type { IBillingProvider } from '#src/use-cases/ports/IBillingProvider.js';
import type { IUserRepository } from '#src/use-cases/ports/IUserRepository.js';

interface Deps {
  userRepository: IUserRepository;
  billingProvider: IBillingProvider;
  now: () => Date;
  /** Where the web app lives; the provider returns the browser to its Billing page. */
  webAppOrigin: string;
  /** When billing went live, if after some users signed up. Null: count from signup. */
  billingLiveFrom: Date | null;
}

export interface CreateCheckoutSessionInput {
  userId: string;
  plan: CheckoutPlan;
}

export interface CreateCheckoutSessionOutput {
  url: string;
}

/**
 * Starts a purchase. The client names a plan; this decides the price, so the
 * founder price cannot be asked for, shared or stacked (JEF-426). Money is
 * never taken for time the user already has: an active subscriber is sent to
 * the portal rather than sold a pass.
 */
export class CreateCheckoutSessionUseCase {
  constructor(private readonly deps: Deps) {}

  async execute(input: CreateCheckoutSessionInput): Promise<CreateCheckoutSessionOutput> {
    const user = await this.deps.userRepository.findById(input.userId);
    if (!user) throw new NotFoundError('User');

    const now = this.deps.now();
    const isSubscriber =
      user.planSource === 'subscription' &&
      user.billingSubscriptionId !== null &&
      effectivePlan(user.plan, user.planExpiresAt, now) === 'pro';
    if (isSubscriber) {
      throw new ConflictError(
        'You already have an active subscription. Manage it from the billing portal.',
      );
    }

    const product: BillingProduct =
      input.plan === 'monthly' && this.isFounder(user.createdAt, now)
        ? 'founder_monthly'
        : input.plan;

    return this.deps.billingProvider.createCheckoutSession({
      userId: user.id,
      email: user.email,
      product,
      customerId: user.billingCustomerId,
      successUrl: `${this.deps.webAppOrigin}/settings/plan`,
    });
  }

  private isFounder(createdAt: Date, now: Date): boolean {
    const liveFrom = this.deps.billingLiveFrom;
    const start = liveFrom && liveFrom.getTime() > createdAt.getTime() ? liveFrom : createdAt;
    return now.getTime() - start.getTime() < BILLING.FOUNDER_WINDOW_DAYS * DURATIONS_MS.DAY;
  }
}
