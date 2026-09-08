export type MessageRole = 'user' | 'assistant';

export type Message = {
  id: string;
  conversationId: string;
  role: MessageRole;
  content: string;
  /** Tool lookups behind an assistant reply, one line each; null when none (F10). */
  toolTrace: string | null;
  createdAt: Date;
};
