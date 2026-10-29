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

export interface ChatMessage {
  id: string;
  role: ChatRole;
  content: string;
  createdAt: string;
  /** Absent on optimistic messages. */
  proposals?: ChatProposal[];
}

export interface Conversation {
  id: string;
  title: string | null;
  llmProvider: string | null;
  llmModel: string | null;
  createdAt: string;
  updatedAt: string;
}
