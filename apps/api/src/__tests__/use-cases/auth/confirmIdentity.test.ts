import { describe, it, expect, vi, beforeEach } from 'vitest';
import { makePasswordHasher } from '#src/__tests__/helpers/mocks/auth.js';
import { confirmIdentity } from '#src/use-cases/auth/confirmIdentity.js';
import { REAUTH } from '#src/use-cases/constants.js';

const passwordHasher = makePasswordHasher();

const fresh = () => Date.now();
const stale = () => Date.now() - REAUTH.FRESHNESS_WINDOW_MS - 1000;

describe('confirmIdentity', () => {
  beforeEach(() => vi.clearAllMocks());

  describe('an account with a password', () => {
    const user = { passwordHash: 'hashed', totpEnabled: false };

    it('passes with the right password', async () => {
      vi.mocked(passwordHasher.compare).mockResolvedValue(true as never);

      await expect(
        confirmIdentity(passwordHasher, user, { currentPassword: 'pw', authTime: stale() }),
      ).resolves.toBeUndefined();
    });

    it('refuses a wrong or missing password, even on a fresh session', async () => {
      vi.mocked(passwordHasher.compare).mockResolvedValue(false as never);

      await expect(
        confirmIdentity(passwordHasher, user, { currentPassword: 'nope', authTime: fresh() }),
      ).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
      await expect(
        confirmIdentity(passwordHasher, user, { authTime: fresh() }),
      ).rejects.toMatchObject({
        code: 'UNAUTHORIZED',
      });
    });

    it('also needs a fresh session when TOTP is on', async () => {
      vi.mocked(passwordHasher.compare).mockResolvedValue(true as never);

      await expect(
        confirmIdentity(
          passwordHasher,
          { ...user, totpEnabled: true },
          { currentPassword: 'pw', authTime: stale() },
        ),
      ).rejects.toMatchObject({ code: 'STEP_UP_REQUIRED' });
    });
  });

  describe('an account with no password (JEF-463)', () => {
    const user = { passwordHash: null, totpEnabled: false };

    it('passes on a fresh session without asking for a password', async () => {
      await expect(
        confirmIdentity(passwordHasher, user, { authTime: fresh() }),
      ).resolves.toBeUndefined();
      expect(passwordHasher.compare).not.toHaveBeenCalled();
    });

    it('asks for a step-up on a stale or pre-authTime session', async () => {
      await expect(
        confirmIdentity(passwordHasher, user, { authTime: stale() }),
      ).rejects.toMatchObject({
        code: 'STEP_UP_REQUIRED',
      });
      await expect(
        confirmIdentity(passwordHasher, user, { authTime: undefined }),
      ).rejects.toMatchObject({
        code: 'STEP_UP_REQUIRED',
      });
    });

    it('refuses an API token, which would otherwise count as fresh', async () => {
      await expect(confirmIdentity(passwordHasher, user, { authTime: null })).rejects.toMatchObject(
        {
          code: 'FORBIDDEN',
        },
      );
    });
  });
});
