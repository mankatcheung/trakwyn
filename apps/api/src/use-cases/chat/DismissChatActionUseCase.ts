import type { ChatActionProposal } from '#src/domain/chatActionProposal/ChatActionProposal.js';
import { ConflictError, NotFoundError } from '#src/use-cases/errors/DomainError.js';
import type { IChatActionProposalRepository } from '#src/use-cases/ports/IChatActionProposalRepository.js';
import type { IMessageRepository } from '#src/use-cases/ports/IMessageRepository.js';

interface Deps {
  chatActionProposalRepository: IChatActionProposalRepository;
  messageRepository: IMessageRepository;
  generateId: () => string;
}

export interface DismissChatActionInput {
  userId: string;
  proposalId: string;
}

/**
 * Turns down a proposed chat write (JEF-469). Nothing was changed, so this
 * only records the decision and tells the model on its next turn.
 */
export class DismissChatActionUseCase {
  constructor(private readonly deps: Deps) {}

  async execute(input: DismissChatActionInput): Promise<{ proposal: ChatActionProposal }> {
    const { chatActionProposalRepository: proposals } = this.deps;
    const existing = await proposals.findByIdForUser(input.proposalId, input.userId);
    if (!existing) throw new NotFoundError('Proposal not found');

    const dismissed = await proposals.resolvePending(
      existing.id,
      input.userId,
      'dismissed',
      new Date(),
    );
    // Not pending any more: confirmed, expired, or dismissed in another tab.
    if (!dismissed) throw new ConflictError('This change has already been handled');

    await this.deps.messageRepository.create({
      id: this.deps.generateId(),
      conversationId: dismissed.conversationId,
      role: 'system',
      content: `User dismissed: ${dismissed.summary}`,
    });
    return { proposal: dismissed };
  }
}
