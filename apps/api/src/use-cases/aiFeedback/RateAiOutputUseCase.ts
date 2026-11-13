import type { AiFeedback } from '#src/domain/aiFeedback/AiFeedback.js';
import {
  NotFoundError,
  RateLimitedError,
  ValidationError,
} from '#src/use-cases/errors/DomainError.js';
import {
  AI_FEATURE,
  AI_FEEDBACK_RATING,
  AI_FEEDBACK_REASON,
  AI_FEEDBACK_TARGET,
  type AiFeedbackRating,
  type AiFeedbackReason,
  type AiFeedbackTarget,
} from '#src/use-cases/constants.js';
import type { IAiFeedbackRepository } from '#src/use-cases/ports/IAiFeedbackRepository.js';
import type { IAiFeedbackObserver } from '#src/use-cases/ports/IAiFeedbackObserver.js';
import type { IMessageRepository } from '#src/use-cases/ports/IMessageRepository.js';
import type { IConversationRepository } from '#src/use-cases/ports/IConversationRepository.js';
import type { IDocumentDraftRepository } from '#src/use-cases/ports/IDocumentDraftRepository.js';
import type { IApplicationRepository } from '#src/use-cases/ports/IApplicationRepository.js';
import type { IRateLimiter } from '#src/use-cases/ports/IRateLimiter.js';

export interface RateAiOutputInput {
  userId: string;
  targetKind: AiFeedbackTarget;
  targetId: string;
  rating: AiFeedbackRating;
  /** Only with a down-vote, and only from the fixed list. */
  reason?: AiFeedbackReason | null;
}

export interface IRateAiOutputUseCase {
  execute(input: RateAiOutputInput): Promise<AiFeedback>;
}

interface Deps {
  aiFeedbackRepository: IAiFeedbackRepository;
  aiFeedbackObserver: IAiFeedbackObserver;
  aiFeedbackRateLimiter: IRateLimiter;
  messageRepository: IMessageRepository;
  conversationRepository: IConversationRepository;
  documentDraftRepository: IDocumentDraftRepository;
  applicationRepository: IApplicationRepository;
  generateId: () => string;
}

/** What a rating is attached to, once proven to be the caller's. */
interface ResolvedTarget {
  feature: string;
  generation: AiFeedback['generation'];
}

const RATINGS: readonly string[] = Object.values(AI_FEEDBACK_RATING);
const REASONS: readonly string[] = Object.values(AI_FEEDBACK_REASON);
const TARGETS: readonly string[] = Object.values(AI_FEEDBACK_TARGET);

/**
 * Rates one AI output (JEF-547). The row copies the target's `generation`
 * (which model and prompt wrote it) and holds none of its text. Someone else's
 * message or draft reads as not found, the same as a record that is not there.
 */
export class RateAiOutputUseCase implements IRateAiOutputUseCase {
  constructor(private readonly deps: Deps) {}

  async execute(input: RateAiOutputInput): Promise<AiFeedback> {
    const reason = input.reason ?? null;
    if (!RATINGS.includes(input.rating)) throw new ValidationError('Unknown rating');
    if (!TARGETS.includes(input.targetKind)) throw new ValidationError('Unknown target');
    if (reason !== null) {
      if (input.rating !== AI_FEEDBACK_RATING.DOWN) {
        throw new ValidationError('A reason can only go with a thumbs down');
      }
      if (!REASONS.includes(reason)) throw new ValidationError('Unknown reason');
    }

    if (!(await this.deps.aiFeedbackRateLimiter.consume(`ai-feedback:user:${input.userId}`))) {
      throw new RateLimitedError('Too many ratings — please wait a moment and try again');
    }

    const target =
      input.targetKind === AI_FEEDBACK_TARGET.CHAT_MESSAGE
        ? await this.resolveMessage(input.userId, input.targetId)
        : await this.resolveDraft(input.userId, input.targetId);

    const feedback = await this.deps.aiFeedbackRepository.upsert({
      id: this.deps.generateId(),
      userId: input.userId,
      targetKind: input.targetKind,
      targetId: input.targetId,
      feature: target.feature,
      rating: input.rating,
      reason,
      generation: target.generation,
    });
    this.deps.aiFeedbackObserver.rated({
      userId: input.userId,
      feature: target.feature,
      rating: input.rating,
      reason,
      generation: target.generation,
    });
    return feedback;
  }

  private async resolveMessage(userId: string, messageId: string): Promise<ResolvedTarget> {
    const message = await this.deps.messageRepository.findById(messageId);
    const conversation = message
      ? await this.deps.conversationRepository.findById(message.conversationId)
      : null;
    if (!message || !conversation || conversation.userId !== userId) {
      throw new NotFoundError('Message not found');
    }
    // Only the assistant's replies are AI output; `system` rows are the app's own notes.
    if (message.role !== 'assistant') {
      throw new ValidationError('Only an assistant reply can be rated');
    }
    return { feature: AI_FEATURE.CHAT, generation: message.generation };
  }

  private async resolveDraft(userId: string, draftId: string): Promise<ResolvedTarget> {
    const draft = await this.deps.documentDraftRepository.findById(draftId);
    const app = draft ? await this.deps.applicationRepository.findById(draft.applicationId) : null;
    if (!draft || !app || app.userId !== userId) {
      throw new NotFoundError('Document draft not found');
    }
    // A draft the user wrote themselves has nothing of the model's to rate.
    if (!draft.generation) {
      throw new ValidationError('This draft was not written by the AI');
    }
    return {
      feature: draft.type === 'resume' ? AI_FEATURE.RESUME : AI_FEATURE.COVER_LETTER,
      generation: draft.generation,
    };
  }
}
