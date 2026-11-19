import { describe, it, expect, vi } from 'vitest';
import { SetLlmApiKeyMonthlyLimitUseCase } from '#src/use-cases/user/SetLlmApiKeyMonthlyLimitUseCase.js';
import { NotFoundError, ValidationError } from '#src/use-cases/errors/DomainError.js';
import { makeLlmApiKey, makeLlmApiKeyRepository } from '#src/__tests__/helpers/mocks/llm.js';

const makeUseCase = (repoOverrides = {}) => {
  const llmApiKeyRepository = makeLlmApiKeyRepository({
    setMonthlyTokenLimit: vi.fn().mockResolvedValue(makeLlmApiKey()),
    ...repoOverrides,
  });
  return {
    llmApiKeyRepository,
    useCase: new SetLlmApiKeyMonthlyLimitUseCase({ llmApiKeyRepository }),
  };
};

describe('SetLlmApiKeyMonthlyLimitUseCase', () => {
  it('sets the limit on the named provider', async () => {
    const { useCase, llmApiKeyRepository } = makeUseCase();

    await useCase.execute({ userId: 'user-1', provider: 'openai', monthlyTokenLimit: 2_000_000 });

    expect(llmApiKeyRepository.setMonthlyTokenLimit).toHaveBeenCalledWith(
      'user-1',
      'openai',
      2_000_000,
    );
  });

  it('clears the limit with null', async () => {
    const { useCase, llmApiKeyRepository } = makeUseCase();

    await useCase.execute({ userId: 'user-1', provider: 'openai', monthlyTokenLimit: null });

    expect(llmApiKeyRepository.setMonthlyTokenLimit).toHaveBeenCalledWith('user-1', 'openai', null);
  });

  it('rejects a fractional limit', async () => {
    const { useCase } = makeUseCase();

    await expect(
      useCase.execute({ userId: 'user-1', provider: 'openai', monthlyTokenLimit: 1.5 }),
    ).rejects.toThrow(ValidationError);
  });

  /** Zero is "a key that can never be used", which is what removing it is for. */
  it('rejects a zero limit', async () => {
    const { useCase } = makeUseCase();

    await expect(
      useCase.execute({ userId: 'user-1', provider: 'openai', monthlyTokenLimit: 0 }),
    ).rejects.toThrow(ValidationError);
  });

  it('rejects a negative limit', async () => {
    const { useCase } = makeUseCase();

    await expect(
      useCase.execute({ userId: 'user-1', provider: 'openai', monthlyTokenLimit: -1 }),
    ).rejects.toThrow(ValidationError);
  });

  it('does not write when validation fails', async () => {
    const { useCase, llmApiKeyRepository } = makeUseCase();

    await expect(
      useCase.execute({ userId: 'user-1', provider: 'openai', monthlyTokenLimit: 0 }),
    ).rejects.toThrow(ValidationError);

    expect(llmApiKeyRepository.setMonthlyTokenLimit).not.toHaveBeenCalled();
  });

  it('reports a provider the user has no key for as not found', async () => {
    const { useCase } = makeUseCase({
      setMonthlyTokenLimit: vi.fn().mockResolvedValue(null),
    });

    await expect(
      useCase.execute({ userId: 'user-1', provider: 'mistral', monthlyTokenLimit: 10 }),
    ).rejects.toThrow(NotFoundError);
  });
});
