import { describe, it, expect, vi, beforeEach } from 'vitest';
import { DismissOnboardingChecklistUseCase } from '#src/use-cases/user/DismissOnboardingChecklistUseCase.js';
import { makeUser, makeUserRepository } from '#src/__tests__/helpers/mocks/user.js';

describe('DismissOnboardingChecklistUseCase', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('throws NOT_FOUND when the user does not exist', async () => {
    const userRepository = makeUserRepository({ findById: vi.fn().mockResolvedValue(null) });

    const err = await new DismissOnboardingChecklistUseCase({ userRepository })
      .execute('missing')
      .catch((e) => e);

    expect((err as { code: string }).code).toBe('NOT_FOUND');
    expect(userRepository.update).not.toHaveBeenCalled();
  });

  it('sets onboardingChecklistDismissedAt to now', async () => {
    const user = makeUser({ id: 'user-1' });
    const userRepository = makeUserRepository({ findById: vi.fn().mockResolvedValue(user) });

    await new DismissOnboardingChecklistUseCase({ userRepository }).execute('user-1');

    expect(userRepository.update).toHaveBeenCalledWith('user-1', {
      onboardingChecklistDismissedAt: expect.any(Date),
    });
  });
});
