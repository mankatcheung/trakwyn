/**
 * Test doubles for the user domain.
 *
 * One of the per-domain modules split out of the former 816-line
 * `helpers/mocks.ts` (JEF-254), which held all 68 factories together and was
 * imported by 157 test files.
 */

import { vi } from 'vitest';
import type { IUserRepository } from '#src/use-cases/ports/IUserRepository.js';
import type { User } from '#src/domain/user/User.js';

export const makeUserRepository = (overrides?: Partial<IUserRepository>): IUserRepository => ({
  findById: vi.fn(),
  findByEmail: vi.fn(),
  findByBackupEmail: vi.fn(),
  findAll: vi.fn().mockResolvedValue([]),
  create: vi.fn(),
  update: vi.fn(),
  delete: vi.fn(),
  updateLastDigestSentAt: vi.fn().mockResolvedValue(undefined),
  ...overrides,
});

export const makeUser = (overrides?: Partial<User>): User => ({
  id: 'user-1',
  email: 'test@example.com',
  passwordHash: 'hashed-pw',
  name: null,
  timezone: null,
  targetRole: null,
  emailVerifiedAt: null,
  avatarKey: null,
  weeklyDigestEnabled: true,
  digestFrequency: 'weekly',
  lastDigestSentAt: null,
  followUpRemindersEnabled: true,
  pushNotificationsEnabled: false,
  weeklyApplicationGoal: 5,
  totpSecret: null,
  totpEnabled: false,
  defaultLlmProvider: null,
  customAiPrompt: null,
  useCrossApplicationContext: false,
  llmFallbackWhenLimited: false,
  backupEmail: null,
  backupEmailVerifiedAt: null,
  onboardingChecklistDismissedAt: null,
  createdAt: new Date('2024-01-01'),
  updatedAt: new Date('2024-01-01'),
  ...overrides,
});
