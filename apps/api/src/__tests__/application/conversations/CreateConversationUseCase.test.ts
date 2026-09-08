import { describe, it, expect, vi } from 'vitest';
import { CreateConversationUseCase } from '#src/use-cases/conversations/CreateConversationUseCase.js';
import { makeConversation, makeConversationRepository } from '#src/__tests__/helpers/mocks/chat.js';
import { makeLlmApiKey, makeLlmApiKeyRepository } from '#src/__tests__/helpers/mocks/llm.js';

describe('CreateConversationUseCase', () => {
  it('creates a conversation for the user with a generated id and no locked provider', async () => {
    const created = makeConversation({ id: 'conv-1', userId: 'user-1' });
    const conversationRepository = makeConversationRepository({
      create: vi.fn().mockResolvedValue(created),
    });
    const llmApiKeyRepository = makeLlmApiKeyRepository();
    const generateId = vi.fn().mockReturnValue('conv-1');

    const useCase = new CreateConversationUseCase({
      conversationRepository,
      llmApiKeyRepository,
      generateId,
    });
    const result = await useCase.execute({ userId: 'user-1' });

    expect(result).toEqual(created);
    expect(conversationRepository.create).toHaveBeenCalledWith({
      id: 'conv-1',
      userId: 'user-1',
      llmProvider: null,
      llmModel: null,
    });
  });

  it('throws VALIDATION when the chosen provider has no configured key', async () => {
    const conversationRepository = makeConversationRepository();
    const llmApiKeyRepository = makeLlmApiKeyRepository({
      findByUserIdAndProvider: vi.fn().mockResolvedValue(null),
    });
    const generateId = vi.fn().mockReturnValue('conv-1');

    const useCase = new CreateConversationUseCase({
      conversationRepository,
      llmApiKeyRepository,
      generateId,
    });

    const err = await useCase.execute({ userId: 'user-1', provider: 'openai' }).catch((e) => e);

    expect((err as { code: string }).code).toBe('VALIDATION');
    expect(conversationRepository.create).not.toHaveBeenCalled();
  });

  it('locks in the chosen provider/model when a configured provider is given', async () => {
    const created = makeConversation({
      id: 'conv-1',
      userId: 'user-1',
      llmProvider: 'openai',
      llmModel: 'gpt-4o',
    });
    const conversationRepository = makeConversationRepository({
      create: vi.fn().mockResolvedValue(created),
    });
    const llmApiKeyRepository = makeLlmApiKeyRepository({
      findByUserIdAndProvider: vi.fn().mockResolvedValue(makeLlmApiKey({ provider: 'openai' })),
    });
    const generateId = vi.fn().mockReturnValue('conv-1');

    const useCase = new CreateConversationUseCase({
      conversationRepository,
      llmApiKeyRepository,
      generateId,
    });
    const result = await useCase.execute({
      userId: 'user-1',
      provider: 'openai',
      model: 'gpt-4o',
    });

    expect(result).toEqual(created);
    expect(conversationRepository.create).toHaveBeenCalledWith({
      id: 'conv-1',
      userId: 'user-1',
      llmProvider: 'openai',
      llmModel: 'gpt-4o',
    });
  });
  it('refuses a model id that could re-target the provider URL', async () => {
    const conversationRepository = makeConversationRepository();
    const llmApiKeyRepository = makeLlmApiKeyRepository({
      findByUserIdAndProvider: vi.fn().mockResolvedValue(makeLlmApiKey({ provider: 'googleai' })),
    });
    const useCase = new CreateConversationUseCase({
      conversationRepository,
      llmApiKeyRepository,
      generateId: vi.fn().mockReturnValue('conv-1'),
    });

    for (const model of ['../../v1/models', 'gemini?key=x', 'a b', 'http://evil']) {
      const err = await useCase
        .execute({ userId: 'user-1', provider: 'googleai', model })
        .catch((e) => e);
      expect((err as { code: string }).code, model).toBe('VALIDATION');
    }
    expect(conversationRepository.create).not.toHaveBeenCalled();
  });
});
