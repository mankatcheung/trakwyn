import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GetNotificationPreferencesUseCase } from '#src/use-cases/user/GetNotificationPreferencesUseCase.js';
import { makeUser, makeUserRepository } from '#src/__tests__/helpers/mocks/user.js';

describe('GetNotificationPreferencesUseCase', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('throws NOT_FOUND when the user does not exist', async () => {
    const userRepository = makeUserRepository({ findById: vi.fn().mockResolvedValue(null) });

    const err = await new GetNotificationPreferencesUseCase({ userRepository })
      .execute('missing')
      .catch((e) => e);

    expect((err as { code: string }).code).toBe('NOT_FOUND');
  });

  it('returns the preferences from the user record', async () => {
    const user = makeUser({
      weeklyDigestEnabled: false,
      digestFrequency: 'off',
      followUpRemindersEnabled: true,
    });
    const userRepository = makeUserRepository({ findById: vi.fn().mockResolvedValue(user) });

    const result = await new GetNotificationPreferencesUseCase({ userRepository }).execute(
      'user-1',
    );

    expect(result).toEqual({
      weeklyDigestEnabled: false,
      digestFrequency: 'off',
      followUpRemindersEnabled: true,
      pushNotificationsEnabled: false,
      weeklyApplicationGoal: 5,
    });
  });
});
