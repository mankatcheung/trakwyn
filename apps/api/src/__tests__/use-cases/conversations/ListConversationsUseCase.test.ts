import { describe, it, expect, vi } from 'vitest';
import { ListConversationsUseCase } from '#src/use-cases/conversations/ListConversationsUseCase.js';
import { makeConversation, makeConversationRepository } from '#src/__tests__/helpers/mocks/chat.js';

describe('ListConversationsUseCase', () => {
  it('returns the conversations for the user', async () => {
    const conversations = [makeConversation({ id: 'conv-1' }), makeConversation({ id: 'conv-2' })];
    const conversationRepository = makeConversationRepository({
      findAllByUserId: vi.fn().mockResolvedValue(conversations),
    });

    const useCase = new ListConversationsUseCase({ conversationRepository });
    const result = await useCase.execute('user-1');

    expect(result).toEqual(conversations);
    expect(conversationRepository.findAllByUserId).toHaveBeenCalledWith('user-1', undefined);
  });

  it('passes the limit through so bounded surfaces do not fetch full history', async () => {
    const conversations = [makeConversation({ id: 'conv-1' })];
    const conversationRepository = makeConversationRepository({
      findAllByUserId: vi.fn().mockResolvedValue(conversations),
    });

    const useCase = new ListConversationsUseCase({ conversationRepository });
    const result = await useCase.execute('user-1', 10);

    expect(result).toEqual(conversations);
    expect(conversationRepository.findAllByUserId).toHaveBeenCalledWith('user-1', 10);
  });

  it('returns an empty array when the user has no conversations', async () => {
    const conversationRepository = makeConversationRepository({
      findAllByUserId: vi.fn().mockResolvedValue([]),
    });

    const useCase = new ListConversationsUseCase({ conversationRepository });
    expect(await useCase.execute('user-1')).toEqual([]);
  });
});
