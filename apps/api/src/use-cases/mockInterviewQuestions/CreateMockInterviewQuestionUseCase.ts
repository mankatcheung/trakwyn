import type { IApplicationRepository } from '#src/use-cases/ports/IApplicationRepository.js';
import type { IInterviewRoundRepository } from '#src/use-cases/ports/IInterviewRoundRepository.js';
import type { IMockInterviewQuestionRepository } from '#src/use-cases/ports/IMockInterviewQuestionRepository.js';
import { findOwnedInterviewRound } from '#src/use-cases/interviewQuestions/ownedInterviewRound.js';
import {
  normaliseAnswer,
  normaliseQuestion,
} from '#src/use-cases/interviewQuestions/interviewQuestionText.js';
import type {
  ICreateMockInterviewQuestionUseCase,
  CreateMockInterviewQuestionInput,
  CreateMockInterviewQuestionOutput,
} from '#src/use-cases/mockInterviewQuestions/ICreateMockInterviewQuestionUseCase.js';

interface Deps {
  applicationRepository: IApplicationRepository;
  interviewRoundRepository: IInterviewRoundRepository;
  mockInterviewQuestionRepository: IMockInterviewQuestionRepository;
  generateId: () => string;
}

export class CreateMockInterviewQuestionUseCase implements ICreateMockInterviewQuestionUseCase {
  constructor(private readonly deps: Deps) {}

  async execute(
    input: CreateMockInterviewQuestionInput,
  ): Promise<CreateMockInterviewQuestionOutput> {
    const round = await findOwnedInterviewRound(this.deps, input.userId, input.roundId);

    const answer = normaliseAnswer(input.answer ?? null);

    // The repository enforces the per-round quota atomically with the insert.
    return this.deps.mockInterviewQuestionRepository.create({
      id: this.deps.generateId(),
      interviewRoundId: round.id,
      question: normaliseQuestion(input.question),
      answer,
      // Without an answer there is nothing for the label to describe.
      answerSource: answer === null ? 'user' : (input.answerSource ?? 'user'),
    });
  }
}
