import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GetTotpStatusUseCase } from '#src/use-cases/user/GetTotpStatusUseCase.js';
import { makeUser, makeUserRepository } from '#src/__tests__/helpers/mocks/user.js';

describe('GetTotpStatusUseCase', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('throws NOT_FOUND when the user does not exist', async () => {
    const userRepository = makeUserRepository({ findById: vi.fn().mockResolvedValue(null) });

    const err = await new GetTotpStatusUseCase({ userRepository })
      .execute('missing')
      .catch((e) => e);

    expect((err as { code: string }).code).toBe('NOT_FOUND');
  });

  it('returns true when 2FA is enabled', async () => {
    const user = makeUser({ totpEnabled: true });
    const userRepository = makeUserRepository({ findById: vi.fn().mockResolvedValue(user) });

    const result = await new GetTotpStatusUseCase({ userRepository }).execute('user-1');

    expect(result).toBe(true);
  });

  it('returns false when 2FA is disabled', async () => {
    const user = makeUser({ totpEnabled: false });
    const userRepository = makeUserRepository({ findById: vi.fn().mockResolvedValue(user) });

    const result = await new GetTotpStatusUseCase({ userRepository }).execute('user-1');

    expect(result).toBe(false);
  });
});
