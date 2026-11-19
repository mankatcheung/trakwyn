import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GetUserUseCase } from '#src/use-cases/user/GetUserUseCase.js';
import { makeUser, makeUserRepository } from '#src/__tests__/helpers/mocks/user.js';

describe('GetUserUseCase', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns the user when found', async () => {
    const user = makeUser({ id: 'user-1' });
    const userRepository = makeUserRepository({ findById: vi.fn().mockResolvedValue(user) });

    const result = await new GetUserUseCase({ userRepository }).execute('user-1');

    expect(userRepository.findById).toHaveBeenCalledWith('user-1');
    expect(result).toEqual(user);
  });

  it('returns null when the user does not exist', async () => {
    const userRepository = makeUserRepository({ findById: vi.fn().mockResolvedValue(null) });

    const result = await new GetUserUseCase({ userRepository }).execute('missing');

    expect(result).toBeNull();
  });
});
