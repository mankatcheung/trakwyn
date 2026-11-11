export type ChatRole = 'user' | 'assistant';

export type ChatProposalStatus = 'pending' | 'confirmed' | 'dismissed' | 'expired' | 'failed';

/** A write the assistant proposed, at its current status (JEF-469). */
export interface ChatProposal {
  id: string;
  toolName: string;
  summary: string;
  status: ChatProposalStatus;
  error: string | null;
}

/** The fixed list of reasons for a thumbs down, in the order they are offered. No free text, on purpose (JEF-547). */
export const AI_FEEDBACK_REASONS = [
  'WRONG_OR_MADE_UP',
  'IGNORED_MY_REQUEST',
  'UNSAFE_OR_INAPPROPRIATE',
  'NOT_USEFUL',
  'OTHER',
] as const;

export type AiFeedbackReason = (typeof AI_FEEDBACK_REASONS)[number];

/** The caller's own thumbs up/down on an assistant reply (JEF-547). */
export interface AiRating {
  rating: 'UP' | 'DOWN';
  reason: AiFeedbackReason | null;
}

export interface ChatMessage {
  id: string;
  role: ChatRole;
  content: string;
  createdAt: string;
  /** Absent on optimistic messages. */
  proposals?: ChatProposal[];
  /** Absent on optimistic messages; null when the reply is unrated. */
  myRating?: AiRating | null;
}

export interface Conversation {
  id: string;
  title: string | null;
  llmProvider: string | null;
  llmModel: string | null;
  createdAt: string;
  updatedAt: string;
}
