import type { ChatActionProposal } from '#src/domain/chatActionProposal/ChatActionProposal.js';
import { ConflictError, DomainError, NotFoundError } from '#src/use-cases/errors/DomainError.js';
import type { IChatActionProposalRepository } from '#src/use-cases/ports/IChatActionProposalRepository.js';
import type { IChatWriteTools } from '#src/use-cases/ports/IChatWriteTools.js';
import type { IMessageRepository } from '#src/use-cases/ports/IMessageRepository.js';
import type { ITransactionManager } from '#src/use-cases/ports/ITransactionManager.js';
import { runInTransaction } from '#src/use-cases/runInTransaction.js';

interface Deps {
  chatActionProposalRepository: IChatActionProposalRepository;
  chatWriteTools: IChatWriteTools;
  messageRepository: IMessageRepository;
  transactionManager?: ITransactionManager;
  generateId: () => string;
}

export interface ConfirmChatActionInput {
  userId: string;
  proposalId: string;
}

export interface ConfirmChatActionOutput {
  proposal: ChatActionProposal;
}

/** The saved tool and arguments could not be applied; the card shows this message. */
const FAILED_FALLBACK = 'The change could not be applied';

/**
 * Applies a proposed chat write after the user pressed Confirm (JEF-469).
 *
 * The proposal is claimed (`pending` to `confirmed`) and applied in one
 * transaction. The claim is a single conditional `UPDATE`, so a double click
 * or two tabs apply it once; a write that throws rolls the claim back with
 * everything it did, and the proposal is then marked `failed` outside the
 * transaction so the card can say why. What runs is the **saved** tool and
 * arguments, never anything the client sends, through the same handlers as
 * MCP, which bring the ownership checks, `assertFeature` and `DomainError`s.
 */
export class ConfirmChatActionUseCase {
  constructor(private readonly deps: Deps) {}

  async execute(input: ConfirmChatActionInput): Promise<ConfirmChatActionOutput> {
    const { chatActionProposalRepository: proposals } = this.deps;
    const now = new Date();

    const existing = await proposals.findByIdForUser(input.proposalId, input.userId);
    if (!existing) throw new NotFoundError('Proposal not found');
    if (existing.status !== 'pending') {
      throw new ConflictError('This change has already been handled');
    }
    if (existing.expiresAt <= now) {
      await proposals.resolvePending(existing.id, input.userId, 'expired', now);
      await this.note(existing, `User tried to confirm "${existing.summary}" but it had expired.`);
      throw new ConflictError('This change has expired — ask the assistant to propose it again');
    }

    let applied: ChatActionProposal;
    try {
      applied = await runInTransaction(this.deps.transactionManager, async () => {
        const claimed = await proposals.claimPending(existing.id, input.userId, now);
        if (!claimed) throw new ConflictError('This change has already been handled');
        await this.deps.chatWriteTools.apply(claimed.toolName, claimed.args, input.userId);
        return claimed;
      });
    } catch (err) {
      if (err instanceof ConflictError) throw err;
      const message = err instanceof DomainError ? err.message : FAILED_FALLBACK;
      await proposals.resolvePending(existing.id, input.userId, 'failed', now, message);
      await this.note(existing, `User confirmed "${existing.summary}" but it failed: ${message}`);
      throw err;
    }

    await this.note(applied, `User confirmed: ${applied.summary}`);
    return { proposal: applied };
  }

  private async note(proposal: ChatActionProposal, content: string): Promise<void> {
    await this.deps.messageRepository.create({
      id: this.deps.generateId(),
      conversationId: proposal.conversationId,
      role: 'system',
      content,
    });
  }
}
