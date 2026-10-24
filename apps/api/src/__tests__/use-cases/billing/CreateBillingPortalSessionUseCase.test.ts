import { describe, expect, it, vi } from 'vitest';
import { CreateBillingPortalSessionUseCase } from '#src/use-cases/billing/CreateBillingPortalSessionUseCase.js';
import { ConflictError, NotFoundError } from '#src/use-cases/errors/DomainError.js';
import { makeBillingProvider } from '#src/__tests__/helpers/mocks/billing.js';
import { makeUser, makeUserRepository } from '#src/__tests__/helpers/mocks/user.js';

function build(user: ReturnType<typeof makeUser> | null) {
  const billingProvider = makeBillingProvider();
  const useCase = new CreateBillingPortalSessionUseCase({
    userRepository: makeUserRepository({ findById: vi.fn().mockResolvedValue(user) }),
    billingProvider,
    webAppOrigin: 'https://app.example',
  });
  return { useCase, billingProvider };
}

describe('CreateBillingPortalSessionUseCase', () => {
  it('opens the portal for the stored customer', async () => {
    const { useCase, billingProvider } = build(makeUser({ billingCustomerId: 'cus-1' }));
    await expect(useCase.execute({ userId: 'user-1' })).resolves.toEqual({
      url: 'https://pay.example/portal',
    });
    expect(billingProvider.createPortalSession).toHaveBeenCalledWith({
      customerId: 'cus-1',
      returnUrl: 'https://app.example/settings/plan',
    });
  });

  it('refuses a user who has never paid', async () => {
    const { useCase } = build(makeUser());
    await expect(useCase.execute({ userId: 'user-1' })).rejects.toBeInstanceOf(ConflictError);
  });

  it('throws NotFoundError for an unknown user', async () => {
    const { useCase } = build(null);
    await expect(useCase.execute({ userId: 'x' })).rejects.toBeInstanceOf(NotFoundError);
  });
});
