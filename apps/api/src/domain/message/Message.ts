import type { AiGeneration } from '#src/domain/aiFeedback/AiFeedback.js';

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
  /** Which model and prompt wrote an assistant reply (JEF-547); null on user rows and on replies from before the snapshot. */
  generation: AiGeneration | null;
  createdAt: Date;
};
