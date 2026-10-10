import { describe, it, expect, vi } from 'vitest';
import { DeleteMockInterviewQuestionUseCase } from '#src/use-cases/mockInterviewQuestions/DeleteMockInterviewQuestionUseCase.js';
import {
  makeMockInterviewQuestion,
  makeMockInterviewQuestionRepository,
  makeInterviewRound,
  makeInterviewRoundRepository,
} from '#src/__tests__/helpers/mocks/interviews.js';
import { makeApplication, makeApplicationRepository } from '#src/__tests__/helpers/mocks/jobs.js';

function makeUseCase(options?: {
  question?: ReturnType<typeof makeMockInterviewQuestion> | null;
  ownerId?: string;
}) {
  const mockInterviewQuestionRepository = makeMockInterviewQuestionRepository({
    findById: vi
      .fn()
      .mockResolvedValue(
        options && 'question' in options ? options.question : makeMockInterviewQuestion(),
      ),
  });
  const useCase = new DeleteMockInterviewQuestionUseCase({
    applicationRepository: makeApplicationRepository({
      findById: vi
        .fn()
        .mockResolvedValue(makeApplication({ userId: options?.ownerId ?? 'user-1' })),
    }),
    interviewRoundRepository: makeInterviewRoundRepository({
      findById: vi.fn().mockResolvedValue(makeInterviewRound()),
    }),
    mockInterviewQuestionRepository,
  });
  return { useCase, mockInterviewQuestionRepository };
}

describe('DeleteMockInterviewQuestionUseCase', () => {
  it('deletes the question for its owner', async () => {
    const { useCase, mockInterviewQuestionRepository } = makeUseCase();

    await useCase.execute({ userId: 'user-1', questionId: 'question-1' });

    expect(mockInterviewQuestionRepository.delete).toHaveBeenCalledWith('question-1');
  });

  it('throws NOT_FOUND for an unknown question', async () => {
    const { useCase, mockInterviewQuestionRepository } = makeUseCase({ question: null });

    const err = await useCase.execute({ userId: 'user-1', questionId: 'x' }).catch((e) => e);

    expect((err as { code: string }).code).toBe('NOT_FOUND');
    expect(mockInterviewQuestionRepository.delete).not.toHaveBeenCalled();
  });

  it("throws FORBIDDEN for another user's question and deletes nothing", async () => {
    const { useCase, mockInterviewQuestionRepository } = makeUseCase({ ownerId: 'other-user' });

    const err = await useCase
      .execute({ userId: 'user-1', questionId: 'question-1' })
      .catch((e) => e);

    expect((err as { code: string }).code).toBe('FORBIDDEN');
    expect(mockInterviewQuestionRepository.delete).not.toHaveBeenCalled();
  });
});
