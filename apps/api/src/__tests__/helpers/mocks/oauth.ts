/**
 * Test doubles for the oauth domain.
 *
 * One of the per-domain modules split out of the former 816-line
 * `helpers/mocks.ts` (JEF-254), which held all 68 factories together and was
 * imported by 157 test files.
 */

import { vi } from 'vitest';
import type { IOAuthAccountRepository } from '#src/use-cases/ports/IOAuthAccountRepository.js';
import type { IOAuthProvider } from '#src/use-cases/ports/IOAuthProvider.js';
import type { IOAuthProviderRegistry } from '#src/use-cases/ports/IOAuthProviderRegistry.js';
import type { OAuthAccount } from '#src/domain/oauthAccount/OAuthAccount.js';

export const makeOAuthAccountRepository = (
  overrides?: Partial<IOAuthAccountRepository>,
): IOAuthAccountRepository => ({
  findByProvider: vi.fn().mockResolvedValue(null),
  findAllByUserId: vi.fn().mockResolvedValue([]),
  create: vi.fn(),
  delete: vi.fn().mockResolvedValue(undefined),
  ...overrides,
});

export const makeOAuthAccount = (overrides?: Partial<OAuthAccount>): OAuthAccount => ({
  id: 'oauth-account-1',
  userId: 'user-1',
  provider: 'google',
  providerAccountId: 'google-sub-1',
  email: 'test@example.com',
  createdAt: new Date('2024-01-01'),
  ...overrides,
});

export const makeOAuthProvider = (overrides?: Partial<IOAuthProvider>): IOAuthProvider => ({
  supportsReauth: true,
  getAuthorizationUrl: vi.fn().mockReturnValue('https://provider.example.com/authorize'),
  exchangeCodeForProfile: vi.fn().mockResolvedValue({
    providerAccountId: 'google-sub-1',
    email: 'test@example.com',
    emailVerified: true,
    name: 'Jeff Man',
  }),
  ...overrides,
});

export const makeOAuthProviderRegistry = (
  overrides?: Partial<IOAuthProviderRegistry>,
): IOAuthProviderRegistry => ({
  get: vi.fn().mockReturnValue(makeOAuthProvider()),
  ...overrides,
});
