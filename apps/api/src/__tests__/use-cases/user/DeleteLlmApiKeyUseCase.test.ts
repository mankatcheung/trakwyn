import { describe, it, expect, vi } from 'vitest';
import { DeleteLlmApiKeyUseCase } from '#src/use-cases/user/DeleteLlmApiKeyUseCase.js';
import { makeLlmApiKeyRepository } from '#src/__tests__/helpers/mocks/llm.js';
import { makeUser, makeUserRepository } from '#src/__tests__/helpers/mocks/user.js';

describe('DeleteLlmApiKeyUseCase', () => {
  it('throws NOT_FOUND when the user does not exist', async () => {
    const userRepository = makeUserRepository({ findById: vi.fn().mockResolvedValue(null) });
    const llmApiKeyRepository = makeLlmApiKeyRepository();

    const err = await new DeleteLlmApiKeyUseCase({ userRepository, llmApiKeyRepository })
      .execute({ userId: 'missing', provider: 'openai' })
      .catch((e) => e);

    expect((err as { code: string }).code).toBe('NOT_FOUND');
  });

  it('deletes the key for the given provider', async () => {
    const user = makeUser({ defaultLlmProvider: 'anthropic' });
    const userRepository = makeUserRepository({
      findById: vi.fn().mockResolvedValue(user),
      update: vi.fn().mockResolvedValue(user),
    });
    const llmApiKeyRepository = makeLlmApiKeyRepository();

    await new DeleteLlmApiKeyUseCase({ userRepository, llmApiKeyRepository }).execute({
      userId: 'user-1',
      provider: 'openai',
    });

    expect(llmApiKeyRepository.delete).toHaveBeenCalledWith('user-1', 'openai');
    expect(userRepository.update).not.toHaveBeenCalled();
  });

  it('clears the default provider when the deleted key was the default', async () => {
    const user = makeUser({ defaultLlmProvider: 'openai' });
    const userRepository = makeUserRepository({
      findById: vi.fn().mockResolvedValue(user),
      update: vi.fn().mockResolvedValue(user),
    });
    const llmApiKeyRepository = makeLlmApiKeyRepository();

    await new DeleteLlmApiKeyUseCase({ userRepository, llmApiKeyRepository }).execute({
      userId: 'user-1',
      provider: 'openai',
    });

    expect(userRepository.update).toHaveBeenCalledWith('user-1', { defaultLlmProvider: null });
  });

  describe('a saved provider order (JEF-503)', () => {
    const run = async (aiProviderOrder: string[] | null, deleted: string) => {
      const user = makeUser({ aiProviderOrder });
      const userRepository = makeUserRepository({
        findById: vi.fn().mockResolvedValue(user),
        update: vi.fn().mockResolvedValue(user),
      });
      await new DeleteLlmApiKeyUseCase({
        userRepository,
        llmApiKeyRepository: makeLlmApiKeyRepository(),
      }).execute({ userId: 'user-1', provider: deleted });
      return userRepository;
    };

    it('removes the deleted key from the list and keeps the rest in order', async () => {
      const userRepository = await run(['anthropic', 'openai', 'groq'], 'openai');

      expect(userRepository.update).toHaveBeenCalledWith('user-1', {
        aiProviderOrder: ['anthropic', 'groq'],
      });
    });

    it('goes back to the older settings when the deleted key was the only entry', async () => {
      const userRepository = await run(['openai'], 'openai');

      expect(userRepository.update).toHaveBeenCalledWith('user-1', { aiProviderOrder: null });
    });

    it('leaves the list alone when the deleted key was not in it', async () => {
      const userRepository = await run(['anthropic'], 'openai');

      expect(userRepository.update).not.toHaveBeenCalled();
    });

    it('leaves a user with no saved list alone', async () => {
      const userRepository = await run(null, 'openai');

      expect(userRepository.update).not.toHaveBeenCalled();
    });
  });
});
