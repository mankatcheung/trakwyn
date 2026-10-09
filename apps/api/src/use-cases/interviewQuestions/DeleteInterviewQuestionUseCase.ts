import { NotFoundError } from '#src/use-cases/errors/DomainError.js';
import type { IApplicationRepository } from '#src/use-cases/ports/IApplicationRepository.js';
import type { IInterviewRoundRepository } from '#src/use-cases/ports/IInterviewRoundRepository.js';
import type { IInterviewQuestionRepository } from '#src/use-cases/ports/IInterviewQuestionRepository.js';
import { findOwnedInterviewRound } from '#src/use-cases/interviewQuestions/ownedInterviewRound.js';
import type {
  IDeleteInterviewQuestionUseCase,
  DeleteInterviewQuestionInput,
} from '#src/use-cases/interviewQuestions/IDeleteInterviewQuestionUseCase.js';

interface Deps {
  applicationRepository: IApplicationRepository;
  interviewRoundRepository: IInterviewRoundRepository;
  interviewQuestionRepository: IInterviewQuestionRepository;
}

export class DeleteInterviewQuestionUseCase implements IDeleteInterviewQuestionUseCase {
  constructor(private readonly deps: Deps) {}

  async execute(input: DeleteInterviewQuestionInput): Promise<void> {
    const existing = await this.deps.interviewQuestionRepository.findById(input.questionId);
    if (!existing) throw new NotFoundError('Interview question not found');

    await findOwnedInterviewRound(this.deps, input.userId, existing.interviewRoundId);

    await this.deps.interviewQuestionRepository.delete(input.questionId);
  }
}
