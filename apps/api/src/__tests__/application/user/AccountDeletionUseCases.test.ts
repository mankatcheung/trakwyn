import { describe, it, expect, vi, beforeEach } from 'vitest';
import { RequestAccountDeletionUseCase } from '#src/use-cases/user/RequestAccountDeletionUseCase.js';
import { ConfirmAccountDeletionUseCase } from '#src/use-cases/user/ConfirmAccountDeletionUseCase.js';
import { CancelAccountDeletionUseCase } from '#src/use-cases/user/CancelAccountDeletionUseCase.js';
import { PurgeScheduledAccountsUseCase } from '#src/use-cases/user/PurgeScheduledAccountsUseCase.js';
import { AssertAccountActiveUseCase } from '#src/use-cases/auth/AssertAccountActiveUseCase.js';
import {
  makeSecurityEventRepository,
  makeUserActionToken,
  makeUserActionTokenRepository,
} from '#src/__tests__/helpers/mocks/auth.js';
import { makeApiTokenRepository } from '#src/__tests__/helpers/mocks/apiTokens.js';
import { makeBillingProvider } from '#src/__tests__/helpers/mocks/billing.js';
import {
  makeDocument,
  makeDocumentRepository,
  makeStorageProvider,
} from '#src/__tests__/helpers/mocks/documents.js';
import {
  makeEmailService,
  makeLogger,
  makeRateLimiter,
} from '#src/__tests__/helpers/mocks/infrastructure.js';
import { makeSessionRepository } from '#src/__tests__/helpers/mocks/sessions.js';
import { makeUser, makeUserRepository } from '#src/__tests__/helpers/mocks/user.js';
import { hashLinkToken } from '#src/use-cases/shared/actionTokens.js';
import { ACCOUNT_DELETION, DURATIONS_MS, REAUTH } from '#src/use-cases/constants.js';

const NOW = new Date('2026-10-28T12:00:00.000Z');
const SCHEDULED = new Date(NOW.getTime() + ACCOUNT_DELETION.GRACE_PERIOD_DAYS * DURATIONS_MS.DAY);
const freshAuthTime = () => Date.now();
const staleAuthTime = () => Date.now() - REAUTH.FRESHNESS_WINDOW_MS - 1000;

beforeEach(() => vi.clearAllMocks());

describe('RequestAccountDeletionUseCase', () => {
  const build = (
    overrides: Partial<ConstructorParameters<typeof RequestAccountDeletionUseCase>[0]> = {},
  ) => {
    const deps = {
      userRepository: makeUserRepository({ findById: vi.fn().mockResolvedValue(makeUser()) }),
      userActionTokenRepository: makeUserActionTokenRepository(),
      emailService: makeEmailService(),
      accountDeletionRateLimiter: makeRateLimiter(),
      logger: makeLogger(),
      generateId: () => 'token-id',
      webAppOrigin: 'https://app.example',
      now: () => NOW,
      ...overrides,
    };
    return { deps, useCase: new RequestAccountDeletionUseCase(deps) };
  };

  it('mails a confirmation link on a fresh session and stores only its hash', async () => {
    const { deps, useCase } = build();

    await useCase.execute({ userId: 'user-1', authTime: freshAuthTime() });

    const url = vi.mocked(deps.emailService.sendAccountDeletionConfirmation).mock.calls[0]?.[1];
    const raw = new URL(url!).searchParams.get('token')!;
    expect(url).toMatch(/^https:\/\/app\.example\/confirm-account-deletion\?token=/);
    expect(deps.userActionTokenRepository.issue).toHaveBeenCalledWith({
      id: 'token-id',
      userId: 'user-1',
      purpose: 'account_deletion_confirm',
      tokenHash: hashLinkToken(raw),
      expiresAt: new Date(NOW.getTime() + ACCOUNT_DELETION.CONFIRM_TTL_MS),
    });
  });

  it('asks for a step-up on a stale session, even without TOTP', async () => {
    const { deps, useCase } = build();

    await expect(
      useCase.execute({ userId: 'user-1', authTime: staleAuthTime() }),
    ).rejects.toMatchObject({ code: 'STEP_UP_REQUIRED' });
    expect(deps.emailService.sendAccountDeletionConfirmation).not.toHaveBeenCalled();
  });

  it('refuses an API token', async () => {
    const { useCase } = build();

    await expect(useCase.execute({ userId: 'user-1', authTime: null })).rejects.toMatchObject({
      code: 'FORBIDDEN',
    });
  });

  it('refuses an account already scheduled', async () => {
    const { useCase } = build({
      userRepository: makeUserRepository({
        findById: vi.fn().mockResolvedValue(makeUser({ deletionScheduledAt: SCHEDULED })),
      }),
    });

    await expect(
      useCase.execute({ userId: 'user-1', authTime: freshAuthTime() }),
    ).rejects.toMatchObject({ code: 'CONFLICT' });
  });

  it('refuses once the per-account budget is spent', async () => {
    const { deps, useCase } = build({
      accountDeletionRateLimiter: makeRateLimiter({ consume: vi.fn().mockResolvedValue(false) }),
    });

    await expect(
      useCase.execute({ userId: 'user-1', authTime: freshAuthTime() }),
    ).rejects.toMatchObject({ code: 'RATE_LIMITED' });
    expect(deps.userActionTokenRepository.issue).not.toHaveBeenCalled();
  });

  it('says so when the mail cannot be sent', async () => {
    const { useCase } = build({
      emailService: makeEmailService({
        sendAccountDeletionConfirmation: vi.fn().mockRejectedValue(new Error('down')),
      }),
    });

    await expect(
      useCase.execute({ userId: 'user-1', authTime: freshAuthTime() }),
    ).rejects.toMatchObject({ code: 'SERVICE_UNAVAILABLE' });
  });
});

describe('ConfirmAccountDeletionUseCase', () => {
  const confirmToken = makeUserActionToken({
    id: 'confirm-1',
    purpose: 'account_deletion_confirm',
    tokenHash: hashLinkToken('raw-confirm'),
  });

  const build = (
    user = makeUser({ backupEmail: 'backup@example.com', backupEmailVerifiedAt: NOW }),
    overrides: Partial<ConstructorParameters<typeof ConfirmAccountDeletionUseCase>[0]> = {},
  ) => {
    const deps = {
      userRepository: makeUserRepository({ findById: vi.fn().mockResolvedValue(user) }),
      userActionTokenRepository: makeUserActionTokenRepository({
        findByTokenHash: vi.fn().mockResolvedValue(confirmToken),
      }),
      sessionRepository: makeSessionRepository(),
      apiTokenRepository: makeApiTokenRepository({
        findAllByUserId: vi.fn().mockResolvedValue([{ id: 'api-1' }, { id: 'api-2' }]),
      }),
      mcpOAuthGrantRepository: {
        findActiveByUserId: vi.fn().mockResolvedValue([{ id: 'grant-1' }]),
      },
      mcpOAuthTokenRepository: { revokeFamily: vi.fn().mockResolvedValue([]) } as never,
      mcpOAuthRefreshTokenRepository: {
        revokeFamily: vi.fn().mockResolvedValue(undefined),
      } as never,
      securityEventRepository: makeSecurityEventRepository(),
      billingProvider: makeBillingProvider(),
      emailService: makeEmailService(),
      logger: makeLogger(),
      generateId: () => 'id',
      webAppOrigin: 'https://app.example',
      now: () => NOW,
      ...overrides,
    };
    return { deps, useCase: new ConfirmAccountDeletionUseCase(deps) };
  };

  it('schedules the deletion, ends every session and token, and mails both addresses', async () => {
    const { deps, useCase } = build();

    const result = await useCase.execute({ token: 'raw-confirm' });

    expect(result.deletionScheduledAt).toEqual(SCHEDULED);
    expect(deps.userActionTokenRepository.findByTokenHash).toHaveBeenCalledWith(
      'account_deletion_confirm',
      hashLinkToken('raw-confirm'),
    );
    expect(deps.userActionTokenRepository.consume).toHaveBeenCalledWith('confirm-1', NOW);
    expect(deps.userRepository.update).toHaveBeenCalledWith('user-1', {
      deletionScheduledAt: SCHEDULED,
    });
    expect(deps.userActionTokenRepository.issue).toHaveBeenCalledWith(
      expect.objectContaining({ purpose: 'account_deletion_cancel', expiresAt: SCHEDULED }),
    );
    expect(deps.sessionRepository.revokeAllForUser).toHaveBeenCalledWith('user-1');
    expect(deps.apiTokenRepository.delete).toHaveBeenCalledTimes(2);
    expect(deps.mcpOAuthTokenRepository.revokeFamily).toHaveBeenCalledWith('grant-1', NOW);
    expect(deps.mcpOAuthRefreshTokenRepository.revokeFamily).toHaveBeenCalledWith('grant-1', NOW);
    expect(deps.securityEventRepository.create).toHaveBeenCalledWith(
      expect.objectContaining({ eventType: 'account_deletion_scheduled' }),
    );
    const sent = vi.mocked(deps.emailService.sendAccountDeletionScheduled).mock.calls;
    expect(sent.map((call) => call[0])).toEqual(['test@example.com', 'backup@example.com']);
    expect(sent[0]?.[2]).toMatch(/^https:\/\/app\.example\/cancel-account-deletion\?token=/);
    expect(deps.billingProvider.scheduleCancellation).not.toHaveBeenCalled();
  });

  it('sets the subscription to end with its period, before changing anything', async () => {
    const { deps, useCase } = build(makeUser({ billingSubscriptionId: 'sub-1' }));

    await useCase.execute({ token: 'raw-confirm' });

    expect(deps.billingProvider.scheduleCancellation).toHaveBeenCalledWith('sub-1');
    expect(deps.emailService.sendAccountDeletionScheduled).toHaveBeenCalledWith(
      'test@example.com',
      SCHEDULED,
      expect.any(String),
      true,
    );
  });

  it('changes nothing, and leaves the link usable, when the subscription cannot be stopped', async () => {
    const { deps, useCase } = build(makeUser({ billingSubscriptionId: 'sub-1' }), {
      billingProvider: makeBillingProvider({
        scheduleCancellation: vi.fn().mockRejectedValue(new Error('Polar answered 500')),
      }),
    });

    await expect(useCase.execute({ token: 'raw-confirm' })).rejects.toMatchObject({
      code: 'SERVICE_UNAVAILABLE',
    });
    expect(deps.userActionTokenRepository.consume).not.toHaveBeenCalled();
    expect(deps.userRepository.update).not.toHaveBeenCalled();
    expect(deps.sessionRepository.revokeAllForUser).not.toHaveBeenCalled();
  });

  it.each([
    ['unknown', null],
    ['used', { ...confirmToken, usedAt: NOW }],
    ['expired', { ...confirmToken, expiresAt: NOW }],
  ])('refuses an %s link', async (_label, token) => {
    const { deps, useCase } = build(undefined, {
      userActionTokenRepository: makeUserActionTokenRepository({
        findByTokenHash: vi.fn().mockResolvedValue(token),
      }),
    });

    await expect(useCase.execute({ token: 'raw-confirm' })).rejects.toMatchObject({
      code: 'UNAUTHORIZED',
    });
    expect(deps.userRepository.update).not.toHaveBeenCalled();
  });

  it('refuses when a simultaneous click spent the link first', async () => {
    const { deps, useCase } = build(undefined, {
      userActionTokenRepository: makeUserActionTokenRepository({
        findByTokenHash: vi.fn().mockResolvedValue(confirmToken),
        consume: vi.fn().mockResolvedValue(false),
      }),
    });

    await expect(useCase.execute({ token: 'raw-confirm' })).rejects.toMatchObject({
      code: 'UNAUTHORIZED',
    });
    expect(deps.userRepository.update).not.toHaveBeenCalled();
  });

  it('answers with the date already set for an account already scheduled', async () => {
    const { deps, useCase } = build(makeUser({ deletionScheduledAt: SCHEDULED }));

    expect(await useCase.execute({ token: 'raw-confirm' })).toEqual({
      deletionScheduledAt: SCHEDULED,
    });
    expect(deps.userRepository.update).not.toHaveBeenCalled();
    expect(deps.emailService.sendAccountDeletionScheduled).not.toHaveBeenCalled();
  });

  it('still schedules when the notice cannot be sent', async () => {
    const { deps, useCase } = build(undefined, {
      emailService: makeEmailService({
        sendAccountDeletionScheduled: vi.fn().mockRejectedValue(new Error('down')),
      }),
    });

    await expect(useCase.execute({ token: 'raw-confirm' })).resolves.toEqual({
      deletionScheduledAt: SCHEDULED,
    });
    expect(deps.logger.error).toHaveBeenCalled();
  });
});

describe('CancelAccountDeletionUseCase', () => {
  const scheduledUser = makeUser({
    deletionScheduledAt: SCHEDULED,
    billingSubscriptionId: 'sub-1',
  });
  const cancelToken = makeUserActionToken({
    purpose: 'account_deletion_cancel',
    tokenHash: hashLinkToken('raw-cancel'),
  });

  const build = (
    user = scheduledUser,
    overrides: Partial<ConstructorParameters<typeof CancelAccountDeletionUseCase>[0]> = {},
  ) => {
    const deps = {
      userRepository: makeUserRepository({ findById: vi.fn().mockResolvedValue(user) }),
      userActionTokenRepository: makeUserActionTokenRepository({
        findByTokenHash: vi.fn().mockResolvedValue(cancelToken),
      }),
      securityEventRepository: makeSecurityEventRepository(),
      billingProvider: makeBillingProvider(),
      emailService: makeEmailService(),
      logger: makeLogger(),
      generateId: () => 'id',
      now: () => NOW,
      ...overrides,
    };
    return { deps, useCase: new CancelAccountDeletionUseCase(deps) };
  };

  it.each([
    ['a signed-in user', { userId: 'user-1' }],
    ['the mailed link', { token: 'raw-cancel' }],
  ])('keeps the account when cancelled by %s', async (_label, input) => {
    const { deps, useCase } = build();

    await useCase.execute(input);

    expect(deps.userRepository.update).toHaveBeenCalledWith('user-1', {
      deletionScheduledAt: null,
    });
    expect(deps.userActionTokenRepository.deleteForUser).toHaveBeenCalledWith(
      'user-1',
      'account_deletion_cancel',
    );
    expect(deps.securityEventRepository.create).toHaveBeenCalledWith(
      expect.objectContaining({ eventType: 'account_deletion_cancelled' }),
    );
    expect(deps.billingProvider.resumeSubscription).toHaveBeenCalledWith('sub-1');
    expect(deps.emailService.sendAccountDeletionCancelled).toHaveBeenCalledWith('test@example.com');
  });

  it('keeps the account even when the subscription cannot be resumed', async () => {
    const { deps, useCase } = build(scheduledUser, {
      billingProvider: makeBillingProvider({
        resumeSubscription: vi.fn().mockRejectedValue(new Error('down')),
      }),
    });

    await useCase.execute({ userId: 'user-1' });

    expect(deps.userRepository.update).toHaveBeenCalledWith('user-1', {
      deletionScheduledAt: null,
    });
    expect(deps.logger.error).toHaveBeenCalled();
  });

  it('does nothing for an account that is not scheduled', async () => {
    const { deps, useCase } = build(makeUser());

    await useCase.execute({ userId: 'user-1' });

    expect(deps.userRepository.update).not.toHaveBeenCalled();
    expect(deps.emailService.sendAccountDeletionCancelled).not.toHaveBeenCalled();
  });

  it('refuses an expired or unknown link', async () => {
    const { useCase } = build(scheduledUser, {
      userActionTokenRepository: makeUserActionTokenRepository({
        findByTokenHash: vi.fn().mockResolvedValue({ ...cancelToken, expiresAt: NOW }),
      }),
    });

    await expect(useCase.execute({ token: 'raw-cancel' })).rejects.toMatchObject({
      code: 'UNAUTHORIZED',
    });
  });
});

describe('PurgeScheduledAccountsUseCase', () => {
  const due = makeUser({
    id: 'due',
    deletionScheduledAt: NOW,
    avatarKey: 'users/due/avatar/a.png',
    billingSubscriptionId: 'sub-1',
  });

  const build = (
    users = [due],
    overrides: Partial<ConstructorParameters<typeof PurgeScheduledAccountsUseCase>[0]> = {},
  ) => {
    const deps = {
      userRepository: makeUserRepository({
        findScheduledForDeletionBefore: vi.fn().mockResolvedValue(users),
        delete: vi.fn().mockResolvedValue(undefined),
      }),
      documentRepository: makeDocumentRepository({
        findAllByUserId: vi.fn().mockResolvedValue([makeDocument({ storageKey: 'doc-key' })]),
      }),
      storageProvider: makeStorageProvider(),
      billingProvider: makeBillingProvider(),
      logger: makeLogger(),
      now: () => NOW,
      ...overrides,
    };
    return { deps, useCase: new PurgeScheduledAccountsUseCase(deps) };
  };

  it('revokes the subscription, deletes the documents and the avatar, then the account', async () => {
    const { deps, useCase } = build();

    expect(await useCase.execute()).toEqual({ purged: 1, failed: 0, overdue: 0 });
    expect(deps.userRepository.findScheduledForDeletionBefore).toHaveBeenCalledWith(NOW);
    expect(deps.billingProvider.revokeSubscription).toHaveBeenCalledWith('sub-1');
    expect(deps.storageProvider.deleteMany).toHaveBeenCalledWith([
      'doc-key',
      'users/due/avatar/a.png',
    ]);
    expect(deps.userRepository.delete).toHaveBeenCalledWith('due');
  });

  it('keeps an account whose subscription cannot be revoked, for the next run', async () => {
    const { deps, useCase } = build([due], {
      billingProvider: makeBillingProvider({
        revokeSubscription: vi.fn().mockRejectedValue(new Error('down')),
      }),
    });

    expect(await useCase.execute()).toEqual({ purged: 0, failed: 1, overdue: 0 });
    expect(deps.storageProvider.deleteMany).not.toHaveBeenCalled();
    expect(deps.userRepository.delete).not.toHaveBeenCalled();
  });

  it('reports an account that keeps failing well past its date', async () => {
    const late = makeUser({
      id: 'late',
      deletionScheduledAt: new Date(NOW.getTime() - ACCOUNT_DELETION.OVERDUE_AFTER_MS - 1),
    });
    const { deps, useCase } = build([late, makeUser({ id: 'ok', deletionScheduledAt: NOW })], {
      userRepository: makeUserRepository({
        findScheduledForDeletionBefore: vi
          .fn()
          .mockResolvedValue([late, makeUser({ id: 'ok', deletionScheduledAt: NOW })]),
        delete: vi.fn().mockImplementation(async (id: string) => {
          if (id === 'late') throw new Error('stuck');
        }),
      }),
    });

    expect(await useCase.execute()).toEqual({ purged: 1, failed: 1, overdue: 1 });
    expect(deps.logger.warn).toHaveBeenCalledWith(expect.any(String), undefined, {
      event: ACCOUNT_DELETION.OVERDUE_EVENT,
      overdue: 1,
    });
  });
});

describe('AssertAccountActiveUseCase', () => {
  it('refuses an account scheduled for deletion', async () => {
    const useCase = new AssertAccountActiveUseCase({
      userRepository: makeUserRepository({
        findById: vi.fn().mockResolvedValue(makeUser({ deletionScheduledAt: SCHEDULED })),
      }),
    });

    await expect(useCase.execute('user-1')).rejects.toMatchObject({
      code: 'ACCOUNT_DELETION_SCHEDULED',
    });
  });

  it('lets any other account, or a missing one, through', async () => {
    for (const user of [makeUser(), null]) {
      const useCase = new AssertAccountActiveUseCase({
        userRepository: makeUserRepository({ findById: vi.fn().mockResolvedValue(user) }),
      });
      await expect(useCase.execute('user-1')).resolves.toBeUndefined();
    }
  });
});
