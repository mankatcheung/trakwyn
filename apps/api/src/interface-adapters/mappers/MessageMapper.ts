import type { ChatActionProposal } from '#src/domain/chatActionProposal/ChatActionProposal.js';
import type { Message } from '#src/domain/message/Message.js';
import type { AiFeedback } from '#src/domain/aiFeedback/AiFeedback.js';
import { toAiRatingDTO, type AiRatingDTO } from '#src/interface-adapters/mappers/AiRatingMapper.js';

export type ChatActionProposalDTO = {
  id: string;
  toolName: string;
  summary: string;
  status: ChatActionProposal['status'];
  error: string | null;
};

export type MessageDTO = {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  createdAt: string;
  proposals: ChatActionProposalDTO[];
  /** The caller's own thumbs up/down on an assistant reply (JEF-547). */
  myRating: AiRatingDTO | null;
};

export class MessageMapper {
  toDTO(
    message: Message,
    proposals: ChatActionProposal[] = [],
    myRating: Pick<AiFeedback, 'rating' | 'reason'> | null = null,
  ): MessageDTO {
    return {
      id: message.id,
      // `system` notes are filtered out before a message reaches a client.
      role: message.role === 'assistant' ? 'assistant' : 'user',
      content: message.content,
      createdAt: message.createdAt.toISOString(),
      proposals: proposals.map((p) => this.proposalToDTO(p)),
      myRating: toAiRatingDTO(myRating),
    };
  }

  proposalToDTO(proposal: ChatActionProposal): ChatActionProposalDTO {
    return {
      id: proposal.id,
      toolName: proposal.toolName,
      summary: proposal.summary,
      status: proposal.status,
      error: proposal.error,
    };
  }
}
