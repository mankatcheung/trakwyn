import { describe, it, expect, vi, beforeEach } from 'vitest';
import { CompleteOnboardingUseCase } from '#src/use-cases/user/CompleteOnboardingUseCase.js';
import { makeUser, makeUserRepository } from '#src/__tests__/helpers/mocks/user.js';

describe('CompleteOnboardingUseCase', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('throws NOT_FOUND when the user does not exist', async () => {
    const userRepository = makeUserRepository({ findById: vi.fn().mockResolvedValue(null) });

    const err = await new CompleteOnboardingUseCase({ userRepository })
      .execute('missing', [])
      .catch((e) => e);

    expect((err as { code: string }).code).toBe('NOT_FOUND');
    expect(userRepository.update).not.toHaveBeenCalled();
  });

  it('saves the goals and the completion time', async () => {
    const userRepository = makeUserRepository({
      findById: vi.fn().mockResolvedValue(makeUser({ id: 'user-1' })),
    });

    await new CompleteOnboardingUseCase({ userRepository }).execute('user-1', [
      'ai_documents',
      'assistant',
    ]);

    expect(userRepository.update).toHaveBeenCalledWith('user-1', {
      onboardingGoals: ['ai_documents', 'assistant'],
      onboardingCompletedAt: expect.any(Date),
    });
  });

  it('saves an empty goal list when the flow is skipped', async () => {
    const userRepository = makeUserRepository({
      findById: vi.fn().mockResolvedValue(makeUser({ id: 'user-1' })),
    });

    await new CompleteOnboardingUseCase({ userRepository }).execute('user-1', []);

    expect(userRepository.update).toHaveBeenCalledWith('user-1', {
      onboardingGoals: [],
      onboardingCompletedAt: expect.any(Date),
    });
  });

  it('stores a goal picked twice once', async () => {
    const userRepository = makeUserRepository({
      findById: vi.fn().mockResolvedValue(makeUser({ id: 'user-1' })),
    });

    await new CompleteOnboardingUseCase({ userRepository }).execute('user-1', ['mcp', 'mcp']);

    expect(userRepository.update).toHaveBeenCalledWith(
      'user-1',
      expect.objectContaining({ onboardingGoals: ['mcp'] }),
    );
  });

  it('refuses an unknown goal with VALIDATION before reading the user', async () => {
    const userRepository = makeUserRepository();

    const err = await new CompleteOnboardingUseCase({ userRepository })
      .execute('user-1', ['track_applications', 'world_domination'])
      .catch((e) => e);

    expect((err as { code: string }).code).toBe('VALIDATION');
    expect(userRepository.findById).not.toHaveBeenCalled();
    expect(userRepository.update).not.toHaveBeenCalled();
  });
});
