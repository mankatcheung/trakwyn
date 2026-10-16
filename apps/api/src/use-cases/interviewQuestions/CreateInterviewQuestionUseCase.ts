import type { IApplicationRepository } from '#src/use-cases/ports/IApplicationRepository.js';
import type { IInterviewRoundRepository } from '#src/use-cases/ports/IInterviewRoundRepository.js';
import type { IInterviewQuestionRepository } from '#src/use-cases/ports/IInterviewQuestionRepository.js';
import { findOwnedInterviewRound } from '#src/use-cases/interviewQuestions/ownedInterviewRound.js';
import {
  normaliseAnswer,
  normaliseQuestion,
} from '#src/use-cases/interviewQuestions/interviewQuestionText.js';
import type {
  ICreateInterviewQuestionUseCase,
  CreateInterviewQuestionInput,
  CreateInterviewQuestionOutput,
} from '#src/use-cases/interviewQuestions/ICreateInterviewQuestionUseCase.js';

interface Deps {
  applicationRepository: IApplicationRepository;
  interviewRoundRepository: IInterviewRoundRepository;
  interviewQuestionRepository: IInterviewQuestionRepository;
  generateId: () => string;
}

export class CreateInterviewQuestionUseCase implements ICreateInterviewQuestionUseCase {
  constructor(private readonly deps: Deps) {}

  async execute(input: CreateInterviewQuestionInput): Promise<CreateInterviewQuestionOutput> {
    const round = await findOwnedInterviewRound(this.deps, input.userId, input.roundId);

    // The repository enforces the per-round quota atomically with the insert.
    return this.deps.interviewQuestionRepository.create({
      id: this.deps.generateId(),
      interviewRoundId: round.id,
      question: normaliseQuestion(input.question),
      answer: normaliseAnswer(input.answer ?? null),
    });
  }
}
