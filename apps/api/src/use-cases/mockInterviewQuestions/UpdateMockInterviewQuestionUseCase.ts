import type { AnswerSource } from '#src/domain/interviewRound/MockInterviewQuestion.js';
import { NotFoundError } from '#src/use-cases/errors/DomainError.js';
import type { IApplicationRepository } from '#src/use-cases/ports/IApplicationRepository.js';
import type { IInterviewRoundRepository } from '#src/use-cases/ports/IInterviewRoundRepository.js';
import type { IMockInterviewQuestionRepository } from '#src/use-cases/ports/IMockInterviewQuestionRepository.js';
import { findOwnedInterviewRound } from '#src/use-cases/interviewQuestions/ownedInterviewRound.js';
import {
  normaliseAnswer,
  normaliseQuestion,
} from '#src/use-cases/interviewQuestions/interviewQuestionText.js';
import type {
  IUpdateMockInterviewQuestionUseCase,
  UpdateMockInterviewQuestionInput,
  UpdateMockInterviewQuestionOutput,
} from '#src/use-cases/mockInterviewQuestions/IUpdateMockInterviewQuestionUseCase.js';

interface Deps {
  applicationRepository: IApplicationRepository;
  interviewRoundRepository: IInterviewRoundRepository;
  mockInterviewQuestionRepository: IMockInterviewQuestionRepository;
}

/**
 * The label sticks: an `ai` answer stays `ai` when only its text is edited. It
 * changes only when the answer is cleared (back to `user`) or an AI draft is
 * saved (`ai`), and is left alone otherwise.
 */
function resolveAnswerSource(
  answer: string | null | undefined,
  requested: AnswerSource | undefined,
): AnswerSource | undefined {
  if (answer === null) return 'user';
  if (answer === undefined) return undefined;
  return requested;
}

export class UpdateMockInterviewQuestionUseCase implements IUpdateMockInterviewQuestionUseCase {
  constructor(private readonly deps: Deps) {}

  async execute(
    input: UpdateMockInterviewQuestionInput,
  ): Promise<UpdateMockInterviewQuestionOutput> {
    const existing = await this.deps.mockInterviewQuestionRepository.findById(input.questionId);
    if (!existing) throw new NotFoundError('Practice question not found');

    await findOwnedInterviewRound(this.deps, input.userId, existing.interviewRoundId);

    const answer = input.answer !== undefined ? normaliseAnswer(input.answer) : undefined;

    return this.deps.mockInterviewQuestionRepository.update(input.questionId, {
      question: input.question !== undefined ? normaliseQuestion(input.question) : undefined,
      answer,
      answerSource: resolveAnswerSource(answer, input.answerSource),
    });
  }
}
