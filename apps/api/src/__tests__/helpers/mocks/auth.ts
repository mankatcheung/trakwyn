/**
 * Test doubles for the auth domain.
 *
 * One of the per-domain modules split out of the former 816-line
 * `helpers/mocks.ts` (JEF-254), which held all 68 factories together and was
 * imported by 157 test files.
 */

import { vi } from 'vitest';
import type { EmailVerificationToken } from '#src/domain/emailVerificationToken/EmailVerificationToken.js';
import type { IEmailVerificationTokenRepository } from '#src/use-cases/ports/IEmailVerificationTokenRepository.js';
import type { ILoginEventRepository } from '#src/use-cases/ports/ILoginEventRepository.js';
import type { IPasswordResetTokenRepository } from '#src/use-cases/ports/IPasswordResetTokenRepository.js';
import type { ISecurityEventRepository } from '#src/use-cases/ports/ISecurityEventRepository.js';
import type { ITotpBackupCodeRepository } from '#src/use-cases/ports/ITotpBackupCodeRepository.js';
import type { ITotpProvider } from '#src/use-cases/ports/ITotpProvider.js';
import type { LoginEvent } from '#src/domain/loginEvent/LoginEvent.js';
import type { PasswordResetToken } from '#src/domain/passwordResetToken/PasswordResetToken.js';
import type { SecurityEvent } from '#src/domain/securityEvent/SecurityEvent.js';
import type { TotpBackupCode } from '#src/domain/totpBackupCode/TotpBackupCode.js';
import type { UserActionToken } from '#src/domain/userActionToken/UserActionToken.js';
import type { IUserActionTokenRepository } from '#src/use-cases/ports/IUserActionTokenRepository.js';
import { TotpProvider } from '#src/infrastructure/auth/TotpProvider.js';

export const makeLoginEventRepository = (
  overrides?: Partial<ILoginEventRepository>,
): ILoginEventRepository => ({
  create: vi.fn(),
  findRecentByUserId: vi.fn().mockResolvedValue([]),
  ...overrides,
});

export const makeLoginEvent = (overrides?: Partial<LoginEvent>): LoginEvent => ({
  id: 'event-1',
  userId: 'user-1',
  ipAddress: '127.0.0.1',
  userAgent: 'Mozilla/5.0',
  createdAt: new Date('2024-01-01'),
  ...overrides,
});

export const makeSecurityEventRepository = (
  overrides?: Partial<ISecurityEventRepository>,
): ISecurityEventRepository => ({
  create: vi.fn(),
  findRecentByUserId: vi.fn().mockResolvedValue([]),
  ...overrides,
});

export const makeSecurityEvent = (overrides?: Partial<SecurityEvent>): SecurityEvent => ({
  id: 'sec-event-1',
  userId: 'user-1',
  eventType: 'password_changed',
  ipAddress: '127.0.0.1',
  userAgent: 'Mozilla/5.0',
  createdAt: new Date('2024-01-01'),
  ...overrides,
});

export const makeUserActionTokenRepository = (
  overrides?: Partial<IUserActionTokenRepository>,
): IUserActionTokenRepository => ({
  issue: vi.fn().mockImplementation(async (data) => makeUserActionToken(data)),
  findLiveForUser: vi.fn().mockResolvedValue(null),
  findByTokenHash: vi.fn().mockResolvedValue(null),
  consume: vi.fn().mockResolvedValue(true),
  deleteForUser: vi.fn().mockResolvedValue(undefined),
  ...overrides,
});

export const makeUserActionToken = (overrides?: Partial<UserActionToken>): UserActionToken => ({
  id: 'action-token-1',
  userId: 'user-1',
  purpose: 'account_deletion_confirm',
  tokenHash: 'hashed-action-token',
  expiresAt: new Date('2099-01-01T00:00:00.000Z'),
  usedAt: null,
  createdAt: new Date('2024-01-01T00:00:00.000Z'),
  ...overrides,
});

export const makePasswordResetTokenRepository = (
  overrides?: Partial<IPasswordResetTokenRepository>,
): IPasswordResetTokenRepository => ({
  create: vi.fn(),
  findByTokenHash: vi.fn().mockResolvedValue(null),
  markUsed: vi.fn().mockResolvedValue(undefined),
  deleteAllForUser: vi.fn().mockResolvedValue(undefined),
  ...overrides,
});

export const makePasswordResetToken = (
  overrides?: Partial<PasswordResetToken>,
): PasswordResetToken => ({
  id: 'reset-token-1',
  userId: 'user-1',
  tokenHash: 'hashed-reset-token',
  expiresAt: new Date('2024-01-01T01:00:00.000Z'),
  usedAt: null,
  createdAt: new Date('2024-01-01T00:00:00.000Z'),
  ...overrides,
});

export const makeEmailVerificationTokenRepository = (
  overrides?: Partial<IEmailVerificationTokenRepository>,
): IEmailVerificationTokenRepository => ({
  create: vi.fn(),
  findByTokenHash: vi.fn().mockResolvedValue(null),
  markUsed: vi.fn().mockResolvedValue(undefined),
  deleteAllForUser: vi.fn().mockResolvedValue(undefined),
  ...overrides,
});

export const makeEmailVerificationToken = (
  overrides?: Partial<EmailVerificationToken>,
): EmailVerificationToken => ({
  id: 'verify-token-1',
  userId: 'user-1',
  tokenHash: 'hashed-verify-token',
  newEmail: null,
  expiresAt: new Date('2024-01-02T00:00:00.000Z'),
  usedAt: null,
  createdAt: new Date('2024-01-01T00:00:00.000Z'),
  ...overrides,
});

export const makeTotpBackupCodeRepository = (
  overrides?: Partial<ITotpBackupCodeRepository>,
): ITotpBackupCodeRepository => ({
  create: vi.fn(),
  findByCodeHash: vi.fn().mockResolvedValue(null),
  markUsed: vi.fn().mockResolvedValue(undefined),
  deleteAllForUser: vi.fn().mockResolvedValue(undefined),
  ...overrides,
});

export const makeTotpBackupCode = (overrides?: Partial<TotpBackupCode>): TotpBackupCode => ({
  id: 'backup-code-1',
  userId: 'user-1',
  codeHash: 'hashed-backup-code',
  usedAt: null,
  createdAt: new Date('2024-01-01T00:00:00.000Z'),
  ...overrides,
});

export const makeTotpProvider = (overrides?: Partial<ITotpProvider>): ITotpProvider => {
  const real = new TotpProvider();
  return {
    generateSecret: () => real.generateSecret(),
    getOtpauthUrl: (secret, label) => real.getOtpauthUrl(secret, label),
    verifyCode: (secret, code) => real.verifyCode(secret, code),
    encryptSecret: (secret) => `encrypted:${secret}`,
    decryptSecret: (secret) => secret.replace(/^encrypted:/, ''),
    ...overrides,
  };
};
