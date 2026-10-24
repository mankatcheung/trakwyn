import { describe, expect, it, vi } from 'vitest';
import { CreateCheckoutSessionUseCase } from '#src/use-cases/billing/CreateCheckoutSessionUseCase.js';
import { ConflictError, NotFoundError } from '#src/use-cases/errors/DomainError.js';
import { makeBillingProvider } from '#src/__tests__/helpers/mocks/billing.js';
import { makeUser, makeUserRepository } from '#src/__tests__/helpers/mocks/user.js';

const NOW = new Date('2026-11-15T12:00:00.000Z');
const DAY = 24 * 60 * 60 * 1000;

function build(user = makeUser(), { liveFrom = null as Date | null } = {}) {
  const billingProvider = makeBillingProvider();
  const useCase = new CreateCheckoutSessionUseCase({
    userRepository: makeUserRepository({ findById: vi.fn().mockResolvedValue(user) }),
    billingProvider,
    now: () => NOW,
    webAppOrigin: 'https://app.example',
    billingLiveFrom: liveFrom,
  });
  return { useCase, billingProvider };
}

const productOf = (p: ReturnType<typeof makeBillingProvider>) =>
  vi.mocked(p.createCheckoutSession).mock.calls[0][0].product;

describe('CreateCheckoutSessionUseCase', () => {
  it('returns the provider checkout url and sends the buyer back to Billing', async () => {
    const { useCase, billingProvider } = build(makeUser({ id: 'u1', email: 'a@b.co' }));
    const result = await useCase.execute({ userId: 'u1', plan: 'pass_3m' });

    expect(result).toEqual({ url: 'https://pay.example/checkout' });
    expect(billingProvider.createCheckoutSession).toHaveBeenCalledWith({
      userId: 'u1',
      email: 'a@b.co',
      product: 'pass_3m',
      customerId: null,
      successUrl: 'https://app.example/settings/plan',
    });
  });

  it('throws NotFoundError for an unknown user', async () => {
    const { useCase } = build(null as never);
    await expect(useCase.execute({ userId: 'x', plan: 'monthly' })).rejects.toBeInstanceOf(
      NotFoundError,
    );
  });

  describe('founder price', () => {
    it('is used for a monthly plan inside 60 days of signup', async () => {
      const { useCase, billingProvider } = build(
        makeUser({ createdAt: new Date(NOW.getTime() - 59 * DAY) }),
      );
      await useCase.execute({ userId: 'user-1', plan: 'monthly' });
      expect(productOf(billingProvider)).toBe('founder_monthly');
    });

    it('is not used after 60 days', async () => {
      const { useCase, billingProvider } = build(
        makeUser({ createdAt: new Date(NOW.getTime() - 61 * DAY) }),
      );
      await useCase.execute({ userId: 'user-1', plan: 'monthly' });
      expect(productOf(billingProvider)).toBe('monthly');
    });

    it('counts from the day billing went live for users who signed up before it', async () => {
      const { useCase, billingProvider } = build(
        makeUser({ createdAt: new Date(NOW.getTime() - 400 * DAY) }),
        { liveFrom: new Date(NOW.getTime() - 10 * DAY) },
      );
      await useCase.execute({ userId: 'user-1', plan: 'monthly' });
      expect(productOf(billingProvider)).toBe('founder_monthly');
    });

    it('never applies to a pass', async () => {
      const { useCase, billingProvider } = build(makeUser({ createdAt: NOW }));
      await useCase.execute({ userId: 'user-1', plan: 'pass_6m' });
      expect(productOf(billingProvider)).toBe('pass_6m');
    });
  });

  describe('plan combinations', () => {
    const subscriber = makeUser({
      plan: 'pro',
      planSource: 'subscription',
      planExpiresAt: null,
      billingSubscriptionId: 'sub-1',
    });

    it('refuses a pass to an active subscriber', async () => {
      const { useCase, billingProvider } = build(subscriber);
      await expect(useCase.execute({ userId: 'user-1', plan: 'pass_3m' })).rejects.toBeInstanceOf(
        ConflictError,
      );
      expect(billingProvider.createCheckoutSession).not.toHaveBeenCalled();
    });

    it('refuses a second subscription to an active subscriber', async () => {
      const { useCase } = build(subscriber);
      await expect(useCase.execute({ userId: 'user-1', plan: 'monthly' })).rejects.toBeInstanceOf(
        ConflictError,
      );
    });

    it('lets a subscriber whose cancelled plan has ended buy again', async () => {
      const { useCase } = build({
        ...subscriber,
        planExpiresAt: new Date(NOW.getTime() - DAY),
      });
      await expect(useCase.execute({ userId: 'user-1', plan: 'pass_3m' })).resolves.toBeDefined();
    });

    it('lets a pass holder subscribe', async () => {
      const { useCase } = build(
        makeUser({
          plan: 'pro',
          planSource: 'pass',
          planExpiresAt: new Date(NOW.getTime() + 30 * DAY),
        }),
      );
      await expect(useCase.execute({ userId: 'user-1', plan: 'monthly' })).resolves.toBeDefined();
    });

    it('lets a pass holder buy another pass', async () => {
      const { useCase } = build(
        makeUser({
          plan: 'pro',
          planSource: 'pass',
          planExpiresAt: new Date(NOW.getTime() + 30 * DAY),
        }),
      );
      await expect(useCase.execute({ userId: 'user-1', plan: 'pass_6m' })).resolves.toBeDefined();
    });
  });
});
