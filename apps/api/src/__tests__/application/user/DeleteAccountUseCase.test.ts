import { describe, it, expect, vi, beforeEach } from 'vitest';
import bcrypt from 'bcryptjs';
import { DeleteAccountUseCase } from '#src/use-cases/user/DeleteAccountUseCase.js';
import { makeBillingProvider } from '#src/__tests__/helpers/mocks/billing.js';
import {
  makeDocument,
  makeDocumentRepository,
  makeStorageProvider,
} from '#src/__tests__/helpers/mocks/documents.js';
import { makeLogger } from '#src/__tests__/helpers/mocks/infrastructure.js';
import { makeUser, makeUserRepository } from '#src/__tests__/helpers/mocks/user.js';

vi.mock('bcryptjs', () => ({
  default: {
    hash: vi.fn(),
    compare: vi.fn(),
  },
}));

describe('DeleteAccountUseCase', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const input = { userId: 'user-1', password: 'secret123' };

  const makeDeps = () => ({
    documentRepository: makeDocumentRepository({ findAllByUserId: vi.fn().mockResolvedValue([]) }),
    storageProvider: makeStorageProvider({ deleteMany: vi.fn().mockResolvedValue(undefined) }),
    billingProvider: makeBillingProvider(),
    logger: makeLogger(),
  });

  it('deletes the user when credentials are valid', async () => {
    const user = makeUser({ id: 'user-1' });
    const userRepository = makeUserRepository({
      findById: vi.fn().mockResolvedValue(user),
      delete: vi.fn().mockResolvedValue(undefined),
    });
    vi.mocked(bcrypt.compare).mockResolvedValue(true as never);

    await new DeleteAccountUseCase({ userRepository, ...makeDeps() }).execute(input);

    expect(bcrypt.compare).toHaveBeenCalledWith(input.password, user.passwordHash);
    expect(userRepository.delete).toHaveBeenCalledWith('user-1');
  });

  it('deletes the documents from storage before deleting the user row', async () => {
    const user = makeUser({ id: 'user-1' });
    const userRepository = makeUserRepository({
      findById: vi.fn().mockResolvedValue(user),
      delete: vi.fn().mockResolvedValue(undefined),
    });
    const documents = [
      makeDocument({ id: 'doc-1', storageKey: 'key-1' }),
      makeDocument({ id: 'doc-2', storageKey: 'key-2' }),
    ];
    const documentRepository = makeDocumentRepository({
      findAllByUserId: vi.fn().mockResolvedValue(documents),
    });
    const storageProvider = makeStorageProvider({
      deleteMany: vi.fn().mockResolvedValue(undefined),
    });
    vi.mocked(bcrypt.compare).mockResolvedValue(true as never);

    await new DeleteAccountUseCase({
      userRepository,
      ...makeDeps(),
      documentRepository,
      storageProvider,
    }).execute(input);

    expect(documentRepository.findAllByUserId).toHaveBeenCalledWith('user-1');
    expect(storageProvider.deleteMany).toHaveBeenCalledWith(['key-1', 'key-2']);
    // Blobs must go before the row: once the user row cascades away, the
    // documents (and their storage keys) go with it.
    expect(vi.mocked(storageProvider.deleteMany).mock.invocationCallOrder[0]).toBeLessThan(
      vi.mocked(userRepository.delete).mock.invocationCallOrder[0],
    );
  });

  it('does not fail when the user has no documents', async () => {
    const user = makeUser({ id: 'user-1' });
    const userRepository = makeUserRepository({
      findById: vi.fn().mockResolvedValue(user),
      delete: vi.fn().mockResolvedValue(undefined),
    });
    vi.mocked(bcrypt.compare).mockResolvedValue(true as never);

    await new DeleteAccountUseCase({ userRepository, ...makeDeps() }).execute(input);

    expect(userRepository.delete).toHaveBeenCalledWith('user-1');
  });

  it('throws NOT_FOUND when user does not exist', async () => {
    const userRepository = makeUserRepository({
      findById: vi.fn().mockResolvedValue(null),
    });
    const deps = makeDeps();

    const err = await new DeleteAccountUseCase({ userRepository, ...deps })
      .execute(input)
      .catch((e) => e);

    expect((err as { code: string }).code).toBe('NOT_FOUND');
    expect(userRepository.delete).not.toHaveBeenCalled();
    expect(deps.storageProvider.deleteMany).not.toHaveBeenCalled();
    expect(deps.billingProvider.revokeSubscription).not.toHaveBeenCalled();
  });

  it('throws UNAUTHORIZED when password is wrong', async () => {
    const user = makeUser({ id: 'user-1', billingSubscriptionId: 'sub-1' });
    const userRepository = makeUserRepository({
      findById: vi.fn().mockResolvedValue(user),
    });
    const deps = makeDeps();
    vi.mocked(bcrypt.compare).mockResolvedValue(false as never);

    const err = await new DeleteAccountUseCase({ userRepository, ...deps })
      .execute(input)
      .catch((e) => e);

    expect((err as { code: string }).code).toBe('UNAUTHORIZED');
    expect(userRepository.delete).not.toHaveBeenCalled();
    expect(deps.storageProvider.deleteMany).not.toHaveBeenCalled();
    // A wrong password must not end somebody's subscription.
    expect(deps.billingProvider.revokeSubscription).not.toHaveBeenCalled();
  });

  describe('step-up freshness (JEF-44)', () => {
    it('throws STEP_UP_REQUIRED for a 2FA-enabled user with a stale session', async () => {
      const user = makeUser({ id: 'user-1', totpEnabled: true, billingSubscriptionId: 'sub-1' });
      const userRepository = makeUserRepository({ findById: vi.fn().mockResolvedValue(user) });
      const deps = makeDeps();
      vi.mocked(bcrypt.compare).mockResolvedValue(true as never);

      const err = await new DeleteAccountUseCase({ userRepository, ...deps })
        .execute({ ...input, authTime: Date.now() - 16 * 60 * 1000 })
        .catch((e) => e);

      expect((err as { code: string }).code).toBe('STEP_UP_REQUIRED');
      expect(userRepository.delete).not.toHaveBeenCalled();
      expect(deps.storageProvider.deleteMany).not.toHaveBeenCalled();
      expect(deps.billingProvider.revokeSubscription).not.toHaveBeenCalled();
    });

    it('succeeds for a 2FA-enabled user with a fresh session', async () => {
      const user = makeUser({ id: 'user-1', totpEnabled: true });
      const userRepository = makeUserRepository({
        findById: vi.fn().mockResolvedValue(user),
        delete: vi.fn().mockResolvedValue(undefined),
      });
      vi.mocked(bcrypt.compare).mockResolvedValue(true as never);

      await new DeleteAccountUseCase({ userRepository, ...makeDeps() }).execute({
        ...input,
        authTime: Date.now(),
      });

      expect(userRepository.delete).toHaveBeenCalledWith('user-1');
    });

    it('does not require freshness for a non-2FA user, even with a stale/missing authTime', async () => {
      const user = makeUser({ id: 'user-1', totpEnabled: false });
      const userRepository = makeUserRepository({
        findById: vi.fn().mockResolvedValue(user),
        delete: vi.fn().mockResolvedValue(undefined),
      });
      vi.mocked(bcrypt.compare).mockResolvedValue(true as never);

      await new DeleteAccountUseCase({ userRepository, ...makeDeps() }).execute({
        ...input,
        authTime: undefined,
      });

      expect(userRepository.delete).toHaveBeenCalledWith('user-1');
    });
  });

  describe('subscription (JEF-439)', () => {
    const subscriber = () =>
      makeUser({
        id: 'user-1',
        plan: 'pro',
        planSource: 'subscription',
        billingCustomerId: 'cus-1',
        billingSubscriptionId: 'sub-1',
      });

    it('revokes the subscription before the documents and the user row are deleted', async () => {
      const userRepository = makeUserRepository({
        findById: vi.fn().mockResolvedValue(subscriber()),
        delete: vi.fn().mockResolvedValue(undefined),
      });
      const deps = makeDeps();
      vi.mocked(bcrypt.compare).mockResolvedValue(true as never);

      await new DeleteAccountUseCase({ userRepository, ...deps }).execute(input);

      expect(deps.billingProvider.revokeSubscription).toHaveBeenCalledExactlyOnceWith('sub-1');
      const [revoked] = vi.mocked(deps.billingProvider.revokeSubscription).mock.invocationCallOrder;
      const [blobs] = vi.mocked(deps.storageProvider.deleteMany).mock.invocationCallOrder;
      const [row] = vi.mocked(userRepository.delete).mock.invocationCallOrder;
      expect(revoked).toBeLessThan(blobs);
      expect(revoked).toBeLessThan(row);
    });

    it.each([
      ['a free user', makeUser({ id: 'user-1' })],
      [
        'a pass holder',
        makeUser({ id: 'user-1', plan: 'pro', planSource: 'pass', billingCustomerId: 'cus-1' }),
      ],
    ])('makes no call to the payment provider for %s', async (_label, user) => {
      const userRepository = makeUserRepository({
        findById: vi.fn().mockResolvedValue(user),
        delete: vi.fn().mockResolvedValue(undefined),
      });
      const deps = makeDeps();
      vi.mocked(bcrypt.compare).mockResolvedValue(true as never);

      await new DeleteAccountUseCase({ userRepository, ...deps }).execute(input);

      expect(deps.billingProvider.revokeSubscription).not.toHaveBeenCalled();
      expect(userRepository.delete).toHaveBeenCalledWith('user-1');
    });

    it('never reads the billing provider for a user without a subscription, since it may not be configured', async () => {
      // In production with BILLING_PROVIDER unset the provider throws when it is resolved, and
      // most users have no subscription: their deletion must not depend on it.
      const userRepository = makeUserRepository({
        findById: vi.fn().mockResolvedValue(makeUser({ id: 'user-1' })),
        delete: vi.fn().mockResolvedValue(undefined),
      });
      const unconfigured = Object.defineProperty(
        { userRepository, ...makeDeps() },
        'billingProvider',
        {
          enumerable: true,
          get: () => {
            throw new Error('BILLING_PROVIDER must be "fake" or "polar"');
          },
        },
      );
      vi.mocked(bcrypt.compare).mockResolvedValue(true as never);

      await expect(
        new DeleteAccountUseCase(
          unconfigured as ConstructorParameters<typeof DeleteAccountUseCase>[0],
        ).execute(input),
      ).resolves.toBeUndefined();
      expect(userRepository.delete).toHaveBeenCalledWith('user-1');
    });

    it('refuses the deletion and deletes nothing when the subscription cannot be revoked', async () => {
      const userRepository = makeUserRepository({
        findById: vi.fn().mockResolvedValue(subscriber()),
        delete: vi.fn().mockResolvedValue(undefined),
      });
      const deps = makeDeps();
      vi.mocked(deps.billingProvider.revokeSubscription).mockRejectedValue(
        new Error('Polar answered 500 for DELETE /subscriptions/sub-1'),
      );
      vi.mocked(bcrypt.compare).mockResolvedValue(true as never);

      const err = await new DeleteAccountUseCase({ userRepository, ...deps })
        .execute(input)
        .catch((e) => e);

      expect((err as { code: string }).code).toBe('SERVICE_UNAVAILABLE');
      expect((err as Error).message).toBe(
        'We could not cancel your subscription. Try again, or contact support.',
      );
      expect(deps.documentRepository.findAllByUserId).not.toHaveBeenCalled();
      expect(deps.storageProvider.deleteMany).not.toHaveBeenCalled();
      expect(userRepository.delete).not.toHaveBeenCalled();
    });

    it("logs the provider's own error, so the cause is not lost behind the plain message", async () => {
      const userRepository = makeUserRepository({
        findById: vi.fn().mockResolvedValue(subscriber()),
      });
      const deps = makeDeps();
      const cause = new Error('Polar answered 500 for DELETE /subscriptions/sub-1');
      vi.mocked(deps.billingProvider.revokeSubscription).mockRejectedValue(cause);
      vi.mocked(bcrypt.compare).mockResolvedValue(true as never);

      await new DeleteAccountUseCase({ userRepository, ...deps }).execute(input).catch(() => {});

      expect(deps.logger.error).toHaveBeenCalledWith(
        '[account deletion] could not revoke the subscription',
        cause,
      );
    });

    it("does not put the provider's error text in the message the user sees", async () => {
      const userRepository = makeUserRepository({
        findById: vi.fn().mockResolvedValue(subscriber()),
      });
      const deps = makeDeps();
      vi.mocked(deps.billingProvider.revokeSubscription).mockRejectedValue(
        new Error('Polar answered 500 for DELETE /subscriptions/sub-1'),
      );
      vi.mocked(bcrypt.compare).mockResolvedValue(true as never);

      const err = await new DeleteAccountUseCase({ userRepository, ...deps })
        .execute(input)
        .catch((e) => e);

      expect((err as Error).message).not.toMatch(/Polar|sub-1/);
    });
  });
});
