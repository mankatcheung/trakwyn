import { describe, it, expect, vi, beforeEach } from 'vitest';
import bcrypt from 'bcryptjs';
import { confirmIdentity } from '#src/use-cases/auth/confirmIdentity.js';
import { REAUTH } from '#src/use-cases/constants.js';

vi.mock('bcryptjs', () => ({ default: { compare: vi.fn() } }));

const fresh = () => Date.now();
const stale = () => Date.now() - REAUTH.FRESHNESS_WINDOW_MS - 1000;

describe('confirmIdentity', () => {
  beforeEach(() => vi.clearAllMocks());

  describe('an account with a password', () => {
    const user = { passwordHash: 'hashed', totpEnabled: false };

    it('passes with the right password', async () => {
      vi.mocked(bcrypt.compare).mockResolvedValue(true as never);

      await expect(
        confirmIdentity(user, { currentPassword: 'pw', authTime: stale() }),
      ).resolves.toBeUndefined();
    });

    it('refuses a wrong or missing password, even on a fresh session', async () => {
      vi.mocked(bcrypt.compare).mockResolvedValue(false as never);

      await expect(
        confirmIdentity(user, { currentPassword: 'nope', authTime: fresh() }),
      ).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
      await expect(confirmIdentity(user, { authTime: fresh() })).rejects.toMatchObject({
        code: 'UNAUTHORIZED',
      });
    });

    it('also needs a fresh session when TOTP is on', async () => {
      vi.mocked(bcrypt.compare).mockResolvedValue(true as never);

      await expect(
        confirmIdentity(
          { ...user, totpEnabled: true },
          { currentPassword: 'pw', authTime: stale() },
        ),
      ).rejects.toMatchObject({ code: 'STEP_UP_REQUIRED' });
    });
  });

  describe('an account with no password (JEF-463)', () => {
    const user = { passwordHash: null, totpEnabled: false };

    it('passes on a fresh session without asking for a password', async () => {
      await expect(confirmIdentity(user, { authTime: fresh() })).resolves.toBeUndefined();
      expect(bcrypt.compare).not.toHaveBeenCalled();
    });

    it('asks for a step-up on a stale or pre-authTime session', async () => {
      await expect(confirmIdentity(user, { authTime: stale() })).rejects.toMatchObject({
        code: 'STEP_UP_REQUIRED',
      });
      await expect(confirmIdentity(user, { authTime: undefined })).rejects.toMatchObject({
        code: 'STEP_UP_REQUIRED',
      });
    });

    it('refuses an API token, which would otherwise count as fresh', async () => {
      await expect(confirmIdentity(user, { authTime: null })).rejects.toMatchObject({
        code: 'FORBIDDEN',
      });
    });
  });
});
