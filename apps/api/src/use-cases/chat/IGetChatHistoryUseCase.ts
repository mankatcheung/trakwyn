import type { ChatActionProposal } from '#src/domain/chatActionProposal/ChatActionProposal.js';
import type { Message } from '#src/domain/message/Message.js';

export interface GetChatHistoryInput {
  userId: string;
  conversationId: string;
}

/** A stored message with the writes the assistant proposed in it, at their current status (JEF-469). */
export type ChatHistoryMessage = Message & { proposals: ChatActionProposal[] };

export interface IGetChatHistoryUseCase {
  execute(input: GetChatHistoryInput): Promise<ChatHistoryMessage[]>;
}
