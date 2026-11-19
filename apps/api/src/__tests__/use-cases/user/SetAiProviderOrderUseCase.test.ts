import { describe, it, expect, vi } from 'vitest';
import { SetAiProviderOrderUseCase } from '#src/use-cases/user/SetAiProviderOrderUseCase.js';
import { makeUser, makeUserRepository } from '#src/__tests__/helpers/mocks/user.js';
import { makeLlmApiKey, makeLlmApiKeyRepository } from '#src/__tests__/helpers/mocks/llm.js';

const build = ({
  keys = ['openai', 'anthropic'],
  hostedAiOn = true,
}: { keys?: string[]; hostedAiOn?: boolean } = {}) => {
  const userRepository = makeUserRepository({ update: vi.fn().mockResolvedValue(makeUser()) });
  const llmApiKeyRepository = makeLlmApiKeyRepository({
    findAllByUserId: vi.fn().mockResolvedValue(keys.map((provider) => makeLlmApiKey({ provider }))),
  });
  const useCase = new SetAiProviderOrderUseCase({
    userRepository,
    llmApiKeyRepository,
    platformLlmProviderFactory: {
      isEnabled: () => hostedAiOn,
      isEnabledFor: () => hostedAiOn,
      legs: () => [],
    },
  });
  return { userRepository, useCase };
};

const codeOf = (err: unknown) => (err as { code: string }).code;

describe('SetAiProviderOrderUseCase', () => {
  it('saves the order exactly as given', async () => {
    const { userRepository, useCase } = build();

    await useCase.execute({ userId: 'user-1', order: ['anthropic', 'trakwyn', 'openai'] });

    expect(userRepository.update).toHaveBeenCalledWith('user-1', {
      aiProviderOrder: ['anthropic', 'trakwyn', 'openai'],
    });
  });

  it('accepts a single provider, which is how a user opts out of any fallback', async () => {
    const { userRepository, useCase } = build();

    await useCase.execute({ userId: 'user-1', order: ['openai'] });

    expect(userRepository.update).toHaveBeenCalledWith('user-1', { aiProviderOrder: ['openai'] });
  });

  it('accepts Trakwyn AI alone for a user with no key', async () => {
    const { userRepository, useCase } = build({ keys: [] });

    await useCase.execute({ userId: 'user-1', order: ['trakwyn'] });

    expect(userRepository.update).toHaveBeenCalledWith('user-1', { aiProviderOrder: ['trakwyn'] });
  });

  it('refuses an empty list: no provider would mean no AI at all', async () => {
    const { userRepository, useCase } = build();

    const err = await useCase.execute({ userId: 'user-1', order: [] }).catch((e) => e);

    expect(codeOf(err)).toBe('VALIDATION');
    expect(userRepository.update).not.toHaveBeenCalled();
  });

  it('refuses a provider listed twice', async () => {
    const { userRepository, useCase } = build();

    const err = await useCase
      .execute({ userId: 'user-1', order: ['openai', 'anthropic', 'openai'] })
      .catch((e) => e);

    expect(codeOf(err)).toBe('VALIDATION');
    expect(userRepository.update).not.toHaveBeenCalled();
  });

  it('refuses a provider the user has no key for, so a list cannot name a vendor they never set up', async () => {
    const { userRepository, useCase } = build({ keys: ['openai'] });

    const err = await useCase
      .execute({ userId: 'user-1', order: ['openai', 'groq'] })
      .catch((e) => e);

    expect(codeOf(err)).toBe('VALIDATION');
    expect((err as Error).message).toContain('groq');
    expect(userRepository.update).not.toHaveBeenCalled();
  });

  it('refuses Trakwyn AI while hosted AI is off for the user', async () => {
    const { userRepository, useCase } = build({ hostedAiOn: false });

    const err = await useCase
      .execute({ userId: 'user-1', order: ['openai', 'trakwyn'] })
      .catch((e) => e);

    expect(codeOf(err)).toBe('VALIDATION');
    expect(userRepository.update).not.toHaveBeenCalled();
  });
});
