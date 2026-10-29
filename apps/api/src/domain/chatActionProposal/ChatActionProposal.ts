export type ChatActionProposalStatus = 'pending' | 'confirmed' | 'dismissed' | 'expired' | 'failed';

/**
 * A write the in-app assistant asked to make (JEF-469). Nothing has
 * happened yet: the tool and arguments are saved exactly as proposed and
 * only run when the user confirms, once, before `expiresAt`.
 */
export type ChatActionProposal = {
  id: string;
  userId: string;
  conversationId: string;
  /** The assistant message the proposal was made in; null until that reply is stored. */
  messageId: string | null;
  toolName: string;
  args: Record<string, unknown>;
  /** One line for the confirmation card: "Move Acme / Engineer to Interviewing". */
  summary: string;
  status: ChatActionProposalStatus;
  /** Why a confirmed proposal failed; null otherwise. */
  error: string | null;
  expiresAt: Date;
  resolvedAt: Date | null;
  createdAt: Date;
};
