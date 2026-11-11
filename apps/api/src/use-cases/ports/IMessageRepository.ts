import type { AiGeneration } from '#src/domain/aiFeedback/AiFeedback.js';
import type { Message, MessageRole } from '#src/domain/message/Message.js';

export interface CreateMessageData {
  id: string;
  conversationId: string;
  role: MessageRole;
  content: string;
  toolTrace?: string | null;
  /** Which model and prompt wrote an assistant reply (JEF-547). */
  generation?: AiGeneration | null;
}

export interface IMessageRepository {
  create(data: CreateMessageData): Promise<Message>;
  findById(id: string): Promise<Message | null>;
  findAllByConversationId(conversationId: string): Promise<Message[]>;
  /**
   * Deletes all but the newest `keep` messages of a conversation (JEF-339).
   * The model is only shown the last `CHAT.MAX_HISTORY_MESSAGES`, so what this
   * drops was stored but never read.
   */
  trimToLatest(conversationId: string, keep: number): Promise<void>;
}
