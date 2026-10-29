import { ForbiddenError, NotFoundError } from '#src/use-cases/errors/DomainError.js';
import type { IMessageRepository } from '#src/use-cases/ports/IMessageRepository.js';
import type { IConversationRepository } from '#src/use-cases/ports/IConversationRepository.js';
import type { IChatActionProposalRepository } from '#src/use-cases/ports/IChatActionProposalRepository.js';
import type {
  IGetChatHistoryUseCase,
  GetChatHistoryInput,
  ChatHistoryMessage,
} from '#src/use-cases/chat/IGetChatHistoryUseCase.js';

interface Deps {
  messageRepository: IMessageRepository;
  conversationRepository: IConversationRepository;
  chatActionProposalRepository: IChatActionProposalRepository;
}

export class GetChatHistoryUseCase implements IGetChatHistoryUseCase {
  constructor(private readonly deps: Deps) {}

  async execute(input: GetChatHistoryInput): Promise<ChatHistoryMessage[]> {
    const conversation = await this.deps.conversationRepository.findById(input.conversationId);
    if (!conversation) {
      throw new NotFoundError('Conversation not found');
    }
    if (conversation.userId !== input.userId) {
      throw new ForbiddenError('Forbidden');
    }

    const [messages, proposals] = await Promise.all([
      this.deps.messageRepository.findAllByConversationId(input.conversationId),
      this.deps.chatActionProposalRepository.findAllByConversationId(input.conversationId),
    ]);
    const now = Date.now();
    // A pending proposal past its expiry is shown as expired, so reopening a
    // conversation never offers a Confirm that would be refused.
    const current = proposals.map((p) =>
      p.status === 'pending' && p.expiresAt.getTime() <= now
        ? { ...p, status: 'expired' as const }
        : p,
    );
    // `system` rows are the app's notes to the model, not part of the conversation the user sees.
    return messages
      .filter((m) => m.role !== 'system')
      .map((m) => ({ ...m, proposals: current.filter((p) => p.messageId === m.id) }));
  }
}
