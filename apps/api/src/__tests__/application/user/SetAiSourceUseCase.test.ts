import { describe, it, expect, vi } from 'vitest';
import { SetAiSourceUseCase } from '#src/use-cases/user/SetAiSourceUseCase.js';
import { makeUser, makeUserRepository } from '#src/__tests__/helpers/mocks/user.js';

const build = (hostedAiEnabled: boolean) => {
  const userRepository = makeUserRepository({
    update: vi.fn().mockResolvedValue(makeUser()),
  });
  const useCase = new SetAiSourceUseCase({
    userRepository,
    platformLlmProviderFactory: { isEnabled: () => hostedAiEnabled, legs: () => [] },
  });
  return { userRepository, useCase };
};

describe('SetAiSourceUseCase', () => {
  it.each(['auto', 'own'])('saves %s whether or not hosted AI is on', async (aiSource) => {
    const { userRepository, useCase } = build(false);

    await useCase.execute({ userId: 'user-1', aiSource });

    expect(userRepository.update).toHaveBeenCalledWith('user-1', { aiSource });
  });

  it('saves trakwyn when hosted AI is on', async () => {
    const { userRepository, useCase } = build(true);

    await useCase.execute({ userId: 'user-1', aiSource: 'trakwyn' });

    expect(userRepository.update).toHaveBeenCalledWith('user-1', { aiSource: 'trakwyn' });
  });

  it('refuses trakwyn when hosted AI is off', async () => {
    const { userRepository, useCase } = build(false);

    const err = await useCase.execute({ userId: 'user-1', aiSource: 'trakwyn' }).catch((e) => e);

    expect((err as { code: string }).code).toBe('VALIDATION');
    expect(userRepository.update).not.toHaveBeenCalled();
  });

  it('refuses a value that is not an AI source', async () => {
    const { userRepository, useCase } = build(true);

    const err = await useCase.execute({ userId: 'user-1', aiSource: 'openai' }).catch((e) => e);

    expect((err as { code: string }).code).toBe('VALIDATION');
    expect(userRepository.update).not.toHaveBeenCalled();
  });
});
