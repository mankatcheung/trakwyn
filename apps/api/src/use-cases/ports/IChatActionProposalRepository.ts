import type {
  ChatActionProposal,
  ChatActionProposalStatus,
} from '#src/domain/chatActionProposal/ChatActionProposal.js';

export interface CreateChatActionProposalData {
  id: string;
  userId: string;
  conversationId: string;
  toolName: string;
  args: Record<string, unknown>;
  summary: string;
  expiresAt: Date;
}

export interface IChatActionProposalRepository {
  create(data: CreateChatActionProposalData): Promise<ChatActionProposal>;
  /** Scoped to the owner: another user's id reads as not found. */
  findByIdForUser(id: string, userId: string): Promise<ChatActionProposal | null>;
  findAllByConversationId(conversationId: string): Promise<ChatActionProposal[]>;
  /** Records which stored assistant message a turn's proposals belong to. */
  attachToMessage(ids: string[], messageId: string): Promise<void>;
  /**
   * Moves a proposal from `pending` to `confirmed` in one conditional
   * `UPDATE`, so two simultaneous confirms cannot both win. Null when it is
   * not the user's, not pending, or past `now`.
   */
  claimPending(id: string, userId: string, now: Date): Promise<ChatActionProposal | null>;
  /**
   * Ends a still-pending proposal with a terminal status. Null when it was no
   * longer pending (already resolved elsewhere), so a dismiss cannot undo a
   * confirm.
   */
  resolvePending(
    id: string,
    userId: string,
    status: Extract<ChatActionProposalStatus, 'dismissed' | 'expired' | 'failed'>,
    now: Date,
    error?: string,
  ): Promise<ChatActionProposal | null>;
}
