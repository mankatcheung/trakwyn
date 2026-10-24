import { describe, expect, it, vi } from 'vitest';
import type { BillingWebhookEvent } from '#src/domain/billing/Billing.js';
import { HandleBillingWebhookUseCase } from '#src/use-cases/billing/HandleBillingWebhookUseCase.js';
import { UnauthorizedError } from '#src/use-cases/errors/DomainError.js';
import {
  makeBillingEventRepository,
  makeBillingProvider,
} from '#src/__tests__/helpers/mocks/billing.js';
import { makeLogger, makeTransactionManager } from '#src/__tests__/helpers/mocks/infrastructure.js';
import { makeUser, makeUserRepository } from '#src/__tests__/helpers/mocks/user.js';

const NOW = new Date('2026-11-15T12:00:00.000Z');
const DAY = 24 * 60 * 60 * 1000;
const INPUT = { rawBody: Buffer.from('{}'), headers: {} };

type Envelope = 'id' | 'userId' | 'customerId';
type EventBody = BillingWebhookEvent extends infer E
  ? E extends unknown
    ? Omit<E, Envelope>
    : never
  : never;
const event = (body: EventBody, over: Partial<BillingWebhookEvent> = {}): BillingWebhookEvent =>
  ({ id: 'evt-1', userId: 'user-1', customerId: 'cus-1', ...body, ...over }) as BillingWebhookEvent;

function build(
  webhook: BillingWebhookEvent,
  { user = makeUser() as ReturnType<typeof makeUser> | null, isNew = true } = {},
) {
  const userRepository = makeUserRepository({
    findById: vi.fn().mockResolvedValue(user),
    findByBillingCustomerId: vi.fn().mockResolvedValue(null),
  });
  const billingEventRepository = makeBillingEventRepository({
    tryRecord: vi.fn().mockResolvedValue(isNew),
  });
  const transactionManager = makeTransactionManager();
  const useCase = new HandleBillingWebhookUseCase({
    userRepository,
    billingEventRepository,
    billingProvider: makeBillingProvider({ parseWebhook: vi.fn().mockReturnValue(webhook) }),
    transactionManager,
    logger: makeLogger(),
    now: () => NOW,
  });
  return { useCase, userRepository, billingEventRepository, transactionManager };
}

describe('HandleBillingWebhookUseCase', () => {
  it('lets a signature failure through before touching anything', async () => {
    const billingEventRepository = makeBillingEventRepository();
    const useCase = new HandleBillingWebhookUseCase({
      userRepository: makeUserRepository(),
      billingEventRepository,
      billingProvider: makeBillingProvider({
        parseWebhook: vi.fn().mockImplementation(() => {
          throw new UnauthorizedError('Invalid webhook signature');
        }),
      }),
      transactionManager: makeTransactionManager(),
      logger: makeLogger(),
      now: () => NOW,
    });
    await expect(useCase.execute(INPUT)).rejects.toBeInstanceOf(UnauthorizedError);
    expect(billingEventRepository.tryRecord).not.toHaveBeenCalled();
  });

  it('does nothing for an event it has already applied', async () => {
    const { useCase, userRepository } = build(
      event({ kind: 'subscription_started', subscriptionId: 'sub-1' }),
      { isNew: false },
    );
    await expect(useCase.execute(INPUT)).resolves.toBe('duplicate');
    expect(userRepository.update).not.toHaveBeenCalled();
  });

  it('records the event and changes the plan inside one transaction', async () => {
    const { useCase, transactionManager, billingEventRepository } = build(
      event({ kind: 'subscription_started', subscriptionId: 'sub-1' }),
    );
    await useCase.execute(INPUT);
    expect(transactionManager.run).toHaveBeenCalledTimes(1);
    expect(billingEventRepository.tryRecord).toHaveBeenCalledWith('evt-1', 'user-1');
  });

  it('puts a new subscriber on Pro with no end date', async () => {
    const { useCase, userRepository } = build(
      event({ kind: 'subscription_started', subscriptionId: 'sub-1' }),
      {
        user: makeUser({
          plan: 'pro',
          planSource: 'pass',
          planExpiresAt: new Date(NOW.getTime() + DAY),
        }),
      },
    );
    await expect(useCase.execute(INPUT)).resolves.toBe('applied');
    expect(userRepository.update).toHaveBeenCalledWith('user-1', {
      plan: 'pro',
      planSource: 'subscription',
      planExpiresAt: null,
      billingCustomerId: 'cus-1',
      billingSubscriptionId: 'sub-1',
    });
  });

  it('finds the user by customer id when the event carries no user id', async () => {
    const { useCase, userRepository } = build(
      event({ kind: 'subscription_started', subscriptionId: 'sub-1' }, { userId: null }),
    );
    vi.mocked(userRepository.findByBillingCustomerId).mockResolvedValue(makeUser({ id: 'user-9' }));
    await useCase.execute(INPUT);
    expect(userRepository.update).toHaveBeenCalledWith('user-9', expect.anything());
  });

  describe('pass', () => {
    it('sets a 3-month pass from now', async () => {
      const { useCase, userRepository } = build(event({ kind: 'pass_purchased', months: 3 }));
      await useCase.execute(INPUT);
      expect(userRepository.update).toHaveBeenCalledWith(
        'user-1',
        expect.objectContaining({
          plan: 'pro',
          planSource: 'pass',
          planExpiresAt: new Date('2027-02-15T12:00:00.000Z'),
        }),
      );
    });

    it('sets a 6-month pass from now', async () => {
      const { useCase, userRepository } = build(event({ kind: 'pass_purchased', months: 6 }));
      await useCase.execute(INPUT);
      expect(userRepository.update).toHaveBeenCalledWith(
        'user-1',
        expect.objectContaining({ planExpiresAt: new Date('2027-05-15T12:00:00.000Z') }),
      );
    });

    it('extends a pass that is still running', async () => {
      const { useCase, userRepository } = build(event({ kind: 'pass_purchased', months: 3 }), {
        user: makeUser({
          plan: 'pro',
          planSource: 'pass',
          planExpiresAt: new Date('2026-12-15T12:00:00.000Z'),
        }),
      });
      await useCase.execute(INPUT);
      expect(userRepository.update).toHaveBeenCalledWith(
        'user-1',
        expect.objectContaining({ planExpiresAt: new Date('2027-03-15T12:00:00.000Z') }),
      );
    });

    it('counts from now when the earlier pass has ended', async () => {
      const { useCase, userRepository } = build(event({ kind: 'pass_purchased', months: 3 }), {
        user: makeUser({
          plan: 'pro',
          planSource: 'pass',
          planExpiresAt: new Date(NOW.getTime() - DAY),
        }),
      });
      await useCase.execute(INPUT);
      expect(userRepository.update).toHaveBeenCalledWith(
        'user-1',
        expect.objectContaining({ planExpiresAt: new Date('2027-02-15T12:00:00.000Z') }),
      );
    });
  });

  describe('cancellation', () => {
    const subscriber = makeUser({
      plan: 'pro',
      planSource: 'subscription',
      billingSubscriptionId: 'sub-1',
    });
    const endsAt = new Date(NOW.getTime() + 20 * DAY);

    it('ends the plan at the end of the paid period, not now', async () => {
      const { useCase, userRepository } = build(
        event({ kind: 'subscription_cancelled', subscriptionId: 'sub-1', endsAt }),
        { user: subscriber },
      );
      await expect(useCase.execute(INPUT)).resolves.toBe('applied');
      expect(userRepository.update).toHaveBeenCalledWith('user-1', { planExpiresAt: endsAt });
    });

    it('ignores the cancellation of a subscription the user is no longer on', async () => {
      const { useCase, userRepository } = build(
        event({ kind: 'subscription_cancelled', subscriptionId: 'sub-old', endsAt }),
        { user: subscriber },
      );
      await expect(useCase.execute(INPUT)).resolves.toBe('ignored');
      expect(userRepository.update).not.toHaveBeenCalled();
    });
  });

  describe('refund or chargeback', () => {
    it('downgrades a subscriber now', async () => {
      const { useCase, userRepository } = build(
        event({ kind: 'payment_reversed', product: 'subscription', subscriptionId: 'sub-1' }),
        {
          user: makeUser({
            plan: 'pro',
            planSource: 'subscription',
            billingSubscriptionId: 'sub-1',
          }),
        },
      );
      await expect(useCase.execute(INPUT)).resolves.toBe('applied');
      expect(userRepository.update).toHaveBeenCalledWith('user-1', {
        plan: 'free',
        planSource: null,
        planExpiresAt: null,
        billingSubscriptionId: null,
      });
    });

    it('downgrades a pass holder now', async () => {
      const { useCase, userRepository } = build(
        event({ kind: 'payment_reversed', product: 'pass', subscriptionId: null }),
        {
          user: makeUser({
            plan: 'pro',
            planSource: 'pass',
            planExpiresAt: new Date(NOW.getTime() + DAY),
          }),
        },
      );
      await useCase.execute(INPUT);
      expect(userRepository.update).toHaveBeenCalledWith(
        'user-1',
        expect.objectContaining({ plan: 'free', planSource: null }),
      );
    });

    it('leaves a subscriber alone when an old pass is refunded', async () => {
      const { useCase, userRepository } = build(
        event({ kind: 'payment_reversed', product: 'pass', subscriptionId: null }),
        {
          user: makeUser({
            plan: 'pro',
            planSource: 'subscription',
            billingSubscriptionId: 'sub-1',
          }),
        },
      );
      await expect(useCase.execute(INPUT)).resolves.toBe('ignored');
      expect(userRepository.update).not.toHaveBeenCalled();
    });
  });

  it('records an event for an unknown user and ignores it, so it is not retried forever', async () => {
    const { useCase, billingEventRepository, userRepository } = build(
      event({ kind: 'pass_purchased', months: 3 }),
      { user: null },
    );
    await expect(useCase.execute(INPUT)).resolves.toBe('ignored');
    expect(billingEventRepository.tryRecord).toHaveBeenCalledWith('evt-1', null);
    expect(userRepository.update).not.toHaveBeenCalled();
  });

  it('ignores an event kind it has no rule for', async () => {
    const { useCase, userRepository } = build(event({ kind: 'ignored' }));
    await expect(useCase.execute(INPUT)).resolves.toBe('ignored');
    expect(userRepository.update).not.toHaveBeenCalled();
  });
});
