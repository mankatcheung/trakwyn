import { NotFoundError } from '#src/use-cases/errors/DomainError.js';
import type { IApplicationRepository } from '#src/use-cases/ports/IApplicationRepository.js';
import type { IInterviewRoundRepository } from '#src/use-cases/ports/IInterviewRoundRepository.js';
import type { IInterviewQuestionRepository } from '#src/use-cases/ports/IInterviewQuestionRepository.js';
import { findOwnedInterviewRound } from '#src/use-cases/interviewQuestions/ownedInterviewRound.js';
import {
  normaliseAnswer,
  normaliseQuestion,
} from '#src/use-cases/interviewQuestions/interviewQuestionText.js';
import type {
  IUpdateInterviewQuestionUseCase,
  UpdateInterviewQuestionInput,
  UpdateInterviewQuestionOutput,
} from '#src/use-cases/interviewQuestions/IUpdateInterviewQuestionUseCase.js';

interface Deps {
  applicationRepository: IApplicationRepository;
  interviewRoundRepository: IInterviewRoundRepository;
  interviewQuestionRepository: IInterviewQuestionRepository;
}

export class UpdateInterviewQuestionUseCase implements IUpdateInterviewQuestionUseCase {
  constructor(private readonly deps: Deps) {}

  async execute(input: UpdateInterviewQuestionInput): Promise<UpdateInterviewQuestionOutput> {
    const existing = await this.deps.interviewQuestionRepository.findById(input.questionId);
    if (!existing) throw new NotFoundError('Interview question not found');

    await findOwnedInterviewRound(this.deps, input.userId, existing.interviewRoundId);

    return this.deps.interviewQuestionRepository.update(input.questionId, {
      question: input.question !== undefined ? normaliseQuestion(input.question) : undefined,
      answer: input.answer !== undefined ? normaliseAnswer(input.answer) : undefined,
    });
  }
}
