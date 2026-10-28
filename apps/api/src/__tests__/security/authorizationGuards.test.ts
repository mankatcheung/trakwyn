/**
 * Authorization and security boundary tests.
 *
 * These tests verify that all state-mutating operations require valid authentication
 * (correct password) and that unauthorized attempts are rejected with UNAUTHORIZED,
 * never silently succeed or leak data.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import bcrypt from 'bcryptjs';
import { RequestEmailChangeUseCase } from '#src/use-cases/user/RequestEmailChangeUseCase.js';
import { UpdatePasswordUseCase } from '#src/use-cases/user/UpdatePasswordUseCase.js';
import { DeleteAccountUseCase } from '#src/use-cases/user/DeleteAccountUseCase.js';
import {
  makeEmailVerificationTokenRepository,
  makeSecurityEventRepository,
} from '#src/__tests__/helpers/mocks/auth.js';
import {
  makeDocumentRepository,
  makeStorageProvider,
} from '#src/__tests__/helpers/mocks/documents.js';
import { makeBillingProvider } from '#src/__tests__/helpers/mocks/billing.js';
import { makeLogger, makeRateLimiter } from '#src/__tests__/helpers/mocks/infrastructure.js';
import { makeUser, makeUserRepository } from '#src/__tests__/helpers/mocks/user.js';
import type { IEmailService } from '#src/use-cases/ports/IEmailService.js';

vi.mock('bcryptjs', () => ({
  default: {
    hash: vi.fn(),
    compare: vi.fn(),
  },
}));

const WRONG_PW = false as never;
const RIGHT_PW = true as never;

const emailService: IEmailService = {
  sendFollowUpReminder: vi.fn().mockResolvedValue(undefined),
  sendWeeklyDigest: vi.fn().mockResolvedValue(undefined),
  sendPasswordReset: vi.fn().mockResolvedValue(undefined),
  sendEmailVerification: vi.fn().mockResolvedValue(undefined),
  sendBackupEmailVerification: vi.fn().mockResolvedValue(undefined),
  sendNewDeviceLoginAlert: vi.fn().mockResolvedValue(undefined),
  sendStepUpCode: vi.fn().mockResolvedValue(undefined),
  sendAccountDeletionConfirmation: vi.fn().mockResolvedValue(undefined),
  sendAccountDeletionScheduled: vi.fn().mockResolvedValue(undefined),
  sendAccountDeletionCancelled: vi.fn().mockResolvedValue(undefined),
};

const emailVerificationTokenRepository = makeEmailVerificationTokenRepository();

const makeEmailChangeDeps = (overrides?: {
  userRepository: ReturnType<typeof makeUserRepository>;
}) => ({
  userRepository: makeUserRepository(),
  emailVerificationTokenRepository,
  emailService,
  requestEmailChangeRateLimiter: makeRateLimiter(),
  generateId: vi.fn().mockReturnValue('token-1'),
  webAppOrigin: 'https://app.example.com',
  ...overrides,
});

const makeUpdatePasswordDeps = (overrides?: {
  userRepository: ReturnType<typeof makeUserRepository>;
}) => ({
  userRepository: makeUserRepository(),
  updatePasswordRateLimiter: makeRateLimiter(),
  securityEventRepository: makeSecurityEventRepository(),
  generateId: () => 'evt-1',
  ...overrides,
});

const makeDeleteAccountDeps = (overrides?: {
  userRepository: ReturnType<typeof makeUserRepository>;
}) => ({
  userRepository: makeUserRepository(),
  documentRepository: makeDocumentRepository({ findAllByUserId: vi.fn().mockResolvedValue([]) }),
  storageProvider: makeStorageProvider(),
  billingProvider: makeBillingProvider(),
  logger: makeLogger(),
  ...overrides,
});

describe('Authorization guards', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('all protected mutations reject missing users with NOT_FOUND', () => {
    const notFound = makeUserRepository({ findById: vi.fn().mockResolvedValue(null) });

    it('RequestEmailChangeUseCase', async () => {
      const err = await new RequestEmailChangeUseCase(
        makeEmailChangeDeps({ userRepository: notFound }),
      )
        .execute({ userId: 'x', currentPassword: 'p', newEmail: 'e@e.com' })
        .catch((e) => e);
      expect((err as { code: string }).code).toBe('NOT_FOUND');
    });

    it('UpdatePasswordUseCase', async () => {
      const err = await new UpdatePasswordUseCase(
        makeUpdatePasswordDeps({ userRepository: notFound }),
      )
        .execute({ userId: 'x', currentPassword: 'p', newPassword: 'newpassword1' })
        .catch((e) => e);
      expect((err as { code: string }).code).toBe('NOT_FOUND');
    });

    it('DeleteAccountUseCase', async () => {
      const err = await new DeleteAccountUseCase(
        makeDeleteAccountDeps({ userRepository: notFound }),
      )
        .execute({ userId: 'x', password: 'p' })
        .catch((e) => e);
      expect((err as { code: string }).code).toBe('NOT_FOUND');
    });
  });

  describe('all protected mutations reject wrong password with UNAUTHORIZED', () => {
    const user = makeUser();
    const repo = makeUserRepository({ findById: vi.fn().mockResolvedValue(user) });

    beforeEach(() => {
      vi.mocked(bcrypt.compare).mockResolvedValue(WRONG_PW);
    });

    it('RequestEmailChangeUseCase does not send a confirmation on wrong password', async () => {
      const err = await new RequestEmailChangeUseCase(makeEmailChangeDeps({ userRepository: repo }))
        .execute({ userId: 'user-1', currentPassword: 'wrong', newEmail: 'e@e.com' })
        .catch((e) => e);

      expect((err as { code: string }).code).toBe('UNAUTHORIZED');
      expect(emailService.sendEmailVerification).not.toHaveBeenCalled();
    });

    it('UpdatePasswordUseCase does not hash or update on wrong password', async () => {
      const err = await new UpdatePasswordUseCase(makeUpdatePasswordDeps({ userRepository: repo }))
        .execute({ userId: 'user-1', currentPassword: 'wrong', newPassword: 'newpassword1' })
        .catch((e) => e);

      expect((err as { code: string }).code).toBe('UNAUTHORIZED');
      expect(bcrypt.hash).not.toHaveBeenCalled();
      expect(repo.update).not.toHaveBeenCalled();
    });

    it('DeleteAccountUseCase does not delete on wrong password', async () => {
      const err = await new DeleteAccountUseCase(makeDeleteAccountDeps({ userRepository: repo }))
        .execute({ userId: 'user-1', password: 'wrong' })
        .catch((e) => e);

      expect((err as { code: string }).code).toBe('UNAUTHORIZED');
      expect(repo.delete).not.toHaveBeenCalled();
    });
  });

  describe('all protected mutations proceed on correct password', () => {
    it('RequestEmailChangeUseCase sends a confirmation on correct password', async () => {
      const user = makeUser();
      const repo = makeUserRepository({
        findById: vi.fn().mockResolvedValue(user),
        findByEmail: vi.fn().mockResolvedValue(null),
      });
      vi.mocked(bcrypt.compare).mockResolvedValue(RIGHT_PW);

      await expect(
        new RequestEmailChangeUseCase(makeEmailChangeDeps({ userRepository: repo })).execute({
          userId: 'user-1',
          currentPassword: 'correct',
          newEmail: 'new@example.com',
        }),
      ).resolves.toBeUndefined();
      expect(emailService.sendEmailVerification).toHaveBeenCalledWith(
        'new@example.com',
        expect.stringContaining('/confirm-email-change?token='),
      );
    });

    it('DeleteAccountUseCase calls delete on correct password', async () => {
      const user = makeUser();
      const repo = makeUserRepository({
        findById: vi.fn().mockResolvedValue(user),
        delete: vi.fn().mockResolvedValue(undefined),
      });
      vi.mocked(bcrypt.compare).mockResolvedValue(RIGHT_PW);

      await expect(
        new DeleteAccountUseCase(makeDeleteAccountDeps({ userRepository: repo })).execute({
          userId: 'user-1',
          password: 'correct',
        }),
      ).resolves.toBeUndefined();
      expect(repo.delete).toHaveBeenCalledWith('user-1');
    });
  });
});
