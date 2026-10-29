/**
 * `system` rows are notes the app writes for the model, such as "User
 * confirmed: …" (JEF-469). They are part of the prompt history and are never
 * shown to the user.
 */
export type MessageRole = 'user' | 'assistant' | 'system';

export type Message = {
  id: string;
  conversationId: string;
  role: MessageRole;
  content: string;
  /** Tool lookups behind an assistant reply, one line each; null when none (F10). */
  toolTrace: string | null;
  createdAt: Date;
};
