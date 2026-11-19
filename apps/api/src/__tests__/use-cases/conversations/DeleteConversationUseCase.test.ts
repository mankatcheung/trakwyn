import { describe, it, expect, vi } from 'vitest';
import { DeleteConversationUseCase } from '#src/use-cases/conversations/DeleteConversationUseCase.js';
import { makeConversation, makeConversationRepository } from '#src/__tests__/helpers/mocks/chat.js';

describe('DeleteConversationUseCase', () => {
  it('deletes the conversation when it belongs to the user', async () => {
    const conversationRepository = makeConversationRepository({
      findById: vi.fn().mockResolvedValue(makeConversation({ id: 'conv-1', userId: 'user-1' })),
    });

    const useCase = new DeleteConversationUseCase({ conversationRepository });
    await useCase.execute({ userId: 'user-1', conversationId: 'conv-1' });

    expect(conversationRepository.delete).toHaveBeenCalledWith('conv-1');
  });

  it('throws NOT_FOUND when the conversation does not exist', async () => {
    const conversationRepository = makeConversationRepository({
      findById: vi.fn().mockResolvedValue(null),
    });

    const useCase = new DeleteConversationUseCase({ conversationRepository });
    const err = await useCase
      .execute({ userId: 'user-1', conversationId: 'conv-1' })
      .catch((e) => e);

    expect((err as { code: string }).code).toBe('NOT_FOUND');
    expect(conversationRepository.delete).not.toHaveBeenCalled();
  });

  it('throws FORBIDDEN when the conversation belongs to another user', async () => {
    const conversationRepository = makeConversationRepository({
      findById: vi
        .fn()
        .mockResolvedValue(makeConversation({ id: 'conv-1', userId: 'someone-else' })),
    });

    const useCase = new DeleteConversationUseCase({ conversationRepository });
    const err = await useCase
      .execute({ userId: 'user-1', conversationId: 'conv-1' })
      .catch((e) => e);

    expect((err as { code: string }).code).toBe('FORBIDDEN');
    expect(conversationRepository.delete).not.toHaveBeenCalled();
  });
});
