import type { AiFeedbackTarget } from '#src/use-cases/constants.js';
import type { IAiFeedbackRepository } from '#src/use-cases/ports/IAiFeedbackRepository.js';

export interface ClearAiOutputRatingInput {
  userId: string;
  targetKind: AiFeedbackTarget;
  targetId: string;
}

export interface IClearAiOutputRatingUseCase {
  execute(input: ClearAiOutputRatingInput): Promise<void>;
}

interface Deps {
  aiFeedbackRepository: IAiFeedbackRepository;
}

/**
 * Takes back a rating (JEF-547). It only ever removes the caller's own row, so
 * there is no target to check: clearing a rating that is not there, or on a
 * message that has since been trimmed away, is a quiet no-op.
 */
export class ClearAiOutputRatingUseCase implements IClearAiOutputRatingUseCase {
  constructor(private readonly deps: Deps) {}

  async execute(input: ClearAiOutputRatingInput): Promise<void> {
    await this.deps.aiFeedbackRepository.clear(input.userId, input.targetKind, input.targetId);
  }
}
