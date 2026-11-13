import type { AiFeedback, AiGeneration } from '#src/domain/aiFeedback/AiFeedback.js';
import type { AiFeedbackTarget } from '#src/use-cases/constants.js';

export interface UpsertAiFeedbackData {
  id: string;
  userId: string;
  targetKind: AiFeedbackTarget;
  targetId: string;
  feature: string;
  rating: string;
  reason: string | null;
  generation: AiGeneration | null;
}

export interface IAiFeedbackRepository {
  /** One rating per user per target: rating again replaces the earlier one. */
  upsert(data: UpsertAiFeedbackData): Promise<AiFeedback>;
  /**
   * Removes the user's rating of the target, if any, and returns it (null when
   * there was none). Never touches another user's.
   */
  clear(userId: string, targetKind: AiFeedbackTarget, targetId: string): Promise<AiFeedback | null>;
  /** The user's ratings among `targetIds`, in one query, so a list makes no N+1 calls. */
  findForTargets(
    userId: string,
    targetKind: AiFeedbackTarget,
    targetIds: string[],
  ): Promise<AiFeedback[]>;
}
