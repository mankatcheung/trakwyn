import { describe, it, expect, vi } from 'vitest';
import { DeleteInterviewQuestionUseCase } from '#src/use-cases/interviewQuestions/DeleteInterviewQuestionUseCase.js';
import {
  makeInterviewQuestion,
  makeInterviewQuestionRepository,
  makeInterviewRound,
  makeInterviewRoundRepository,
} from '#src/__tests__/helpers/mocks/interviews.js';
import { makeApplication, makeApplicationRepository } from '#src/__tests__/helpers/mocks/jobs.js';

function makeUseCase(options?: {
  question?: ReturnType<typeof makeInterviewQuestion> | null;
  ownerId?: string;
}) {
  const interviewQuestionRepository = makeInterviewQuestionRepository({
    findById: vi
      .fn()
      .mockResolvedValue(
        options && 'question' in options ? options.question : makeInterviewQuestion(),
      ),
  });
  const useCase = new DeleteInterviewQuestionUseCase({
    applicationRepository: makeApplicationRepository({
      findById: vi
        .fn()
        .mockResolvedValue(makeApplication({ userId: options?.ownerId ?? 'user-1' })),
    }),
    interviewRoundRepository: makeInterviewRoundRepository({
      findById: vi.fn().mockResolvedValue(makeInterviewRound()),
    }),
    interviewQuestionRepository,
  });
  return { useCase, interviewQuestionRepository };
}

describe('DeleteInterviewQuestionUseCase', () => {
  it('deletes the question for its owner', async () => {
    const { useCase, interviewQuestionRepository } = makeUseCase();

    await useCase.execute({ userId: 'user-1', questionId: 'question-1' });

    expect(interviewQuestionRepository.delete).toHaveBeenCalledWith('question-1');
  });

  it('throws NOT_FOUND for an unknown question', async () => {
    const { useCase, interviewQuestionRepository } = makeUseCase({ question: null });

    const err = await useCase.execute({ userId: 'user-1', questionId: 'x' }).catch((e) => e);

    expect((err as { code: string }).code).toBe('NOT_FOUND');
    expect(interviewQuestionRepository.delete).not.toHaveBeenCalled();
  });

  it("throws FORBIDDEN for another user's question and deletes nothing", async () => {
    const { useCase, interviewQuestionRepository } = makeUseCase({ ownerId: 'other-user' });

    const err = await useCase
      .execute({ userId: 'user-1', questionId: 'question-1' })
      .catch((e) => e);

    expect((err as { code: string }).code).toBe('FORBIDDEN');
    expect(interviewQuestionRepository.delete).not.toHaveBeenCalled();
  });
});
