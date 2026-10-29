import type { ChatActionProposal } from '#src/domain/chatActionProposal/ChatActionProposal.js';
import type { Message } from '#src/domain/message/Message.js';

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
};

export class MessageMapper {
  toDTO(message: Message, proposals: ChatActionProposal[] = []): MessageDTO {
    return {
      id: message.id,
      // `system` notes are filtered out before a message reaches a client.
      role: message.role === 'assistant' ? 'assistant' : 'user',
      content: message.content,
      createdAt: message.createdAt.toISOString(),
      proposals: proposals.map((p) => this.proposalToDTO(p)),
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
