import { describe, it, expect, vi } from 'vitest';
import { SearchConversationsUseCase } from '#src/use-cases/conversations/SearchConversationsUseCase.js';
import { makeConversation, makeConversationRepository } from '#src/__tests__/helpers/mocks/chat.js';

describe('SearchConversationsUseCase', () => {
  it('searches the user’s conversations by the trimmed term', async () => {
    const conversations = [makeConversation({ id: 'conv-1', title: 'Stripe prep' })];
    const conversationRepository = makeConversationRepository({
      searchByUserId: vi.fn().mockResolvedValue(conversations),
    });

    const useCase = new SearchConversationsUseCase({ conversationRepository });
    const result = await useCase.execute('user-1', '  stripe ');

    expect(result).toEqual(conversations);
    expect(conversationRepository.searchByUserId).toHaveBeenCalledWith('user-1', 'stripe');
  });

  it('returns nothing for a blank term instead of listing everything', async () => {
    const conversationRepository = makeConversationRepository({
      searchByUserId: vi.fn(),
    });

    const useCase = new SearchConversationsUseCase({ conversationRepository });

    expect(await useCase.execute('user-1', '   ')).toEqual([]);
    expect(await useCase.execute('user-1', '')).toEqual([]);
    expect(conversationRepository.searchByUserId).not.toHaveBeenCalled();
  });
});
