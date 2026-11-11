import { ForbiddenError, NotFoundError } from '#src/use-cases/errors/DomainError.js';
import type { IMessageRepository } from '#src/use-cases/ports/IMessageRepository.js';
import type { IConversationRepository } from '#src/use-cases/ports/IConversationRepository.js';
import type { IAiFeedbackRepository } from '#src/use-cases/ports/IAiFeedbackRepository.js';
import { AI_FEEDBACK_TARGET } from '#src/use-cases/constants.js';
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
  aiFeedbackRepository: IAiFeedbackRepository;
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
    const visible = messages.filter((m) => m.role !== 'system');
    // One query for every reply's rating, so the history makes no N+1 calls (JEF-547).
    const ratings = await this.deps.aiFeedbackRepository.findForTargets(
      input.userId,
      AI_FEEDBACK_TARGET.CHAT_MESSAGE,
      visible.filter((m) => m.role === 'assistant').map((m) => m.id),
    );
    const ratingByMessage = new Map(ratings.map((r) => [r.targetId, r]));
    return visible.map((m) => ({
      ...m,
      proposals: current.filter((p) => p.messageId === m.id),
      myRating: ratingByMessage.get(m.id) ?? null,
    }));
  }
}
