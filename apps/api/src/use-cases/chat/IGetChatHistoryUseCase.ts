import type { ChatActionProposal } from '#src/domain/chatActionProposal/ChatActionProposal.js';
import type { AiFeedback } from '#src/domain/aiFeedback/AiFeedback.js';
import type { Message } from '#src/domain/message/Message.js';

export interface GetChatHistoryInput {
  userId: string;
  conversationId: string;
}

/**
 * A stored message with the writes the assistant proposed in it, at their current
 * status (JEF-469), and the caller's own rating of it (JEF-547).
 */
export type ChatHistoryMessage = Message & {
  proposals: ChatActionProposal[];
  myRating: Pick<AiFeedback, 'rating' | 'reason'> | null;
};

export interface IGetChatHistoryUseCase {
  execute(input: GetChatHistoryInput): Promise<ChatHistoryMessage[]>;
}
