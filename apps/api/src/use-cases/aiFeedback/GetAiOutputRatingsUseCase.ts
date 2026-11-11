import type { AiFeedback } from '#src/domain/aiFeedback/AiFeedback.js';
import type { AiFeedbackTarget } from '#src/use-cases/constants.js';
import type { IAiFeedbackRepository } from '#src/use-cases/ports/IAiFeedbackRepository.js';

export interface GetAiOutputRatingsInput {
  userId: string;
  targetKind: AiFeedbackTarget;
  targetIds: string[];
}

export interface IGetAiOutputRatingsUseCase {
  execute(input: GetAiOutputRatingsInput): Promise<AiFeedback[]>;
}

interface Deps {
  aiFeedbackRepository: IAiFeedbackRepository;
}

/** The caller's own ratings among some outputs, in one query (JEF-547). Never another user's. */
export class GetAiOutputRatingsUseCase implements IGetAiOutputRatingsUseCase {
  constructor(private readonly deps: Deps) {}

  execute(input: GetAiOutputRatingsInput): Promise<AiFeedback[]> {
    return this.deps.aiFeedbackRepository.findForTargets(
      input.userId,
      input.targetKind,
      input.targetIds,
    );
  }
}
