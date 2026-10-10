import { NotFoundError } from '#src/use-cases/errors/DomainError.js';
import type { IApplicationRepository } from '#src/use-cases/ports/IApplicationRepository.js';
import type { IInterviewRoundRepository } from '#src/use-cases/ports/IInterviewRoundRepository.js';
import type { IMockInterviewQuestionRepository } from '#src/use-cases/ports/IMockInterviewQuestionRepository.js';
import { findOwnedInterviewRound } from '#src/use-cases/interviewQuestions/ownedInterviewRound.js';
import type {
  IDeleteMockInterviewQuestionUseCase,
  DeleteMockInterviewQuestionInput,
} from '#src/use-cases/mockInterviewQuestions/IDeleteMockInterviewQuestionUseCase.js';

interface Deps {
  applicationRepository: IApplicationRepository;
  interviewRoundRepository: IInterviewRoundRepository;
  mockInterviewQuestionRepository: IMockInterviewQuestionRepository;
}

export class DeleteMockInterviewQuestionUseCase implements IDeleteMockInterviewQuestionUseCase {
  constructor(private readonly deps: Deps) {}

  async execute(input: DeleteMockInterviewQuestionInput): Promise<void> {
    const existing = await this.deps.mockInterviewQuestionRepository.findById(input.questionId);
    if (!existing) throw new NotFoundError('Practice question not found');

    await findOwnedInterviewRound(this.deps, input.userId, existing.interviewRoundId);

    await this.deps.mockInterviewQuestionRepository.delete(input.questionId);
  }
}
