import { describe, it, expect, vi } from 'vitest';
import { UpdateInterviewQuestionUseCase } from '#src/use-cases/interviewQuestions/UpdateInterviewQuestionUseCase.js';
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
  round?: ReturnType<typeof makeInterviewRound>;
}) {
  const interviewQuestionRepository = makeInterviewQuestionRepository({
    findById: vi
      .fn()
      .mockResolvedValue(
        options && 'question' in options ? options.question : makeInterviewQuestion(),
      ),
    update: vi.fn().mockResolvedValue(makeInterviewQuestion({ answer: 'updated' })),
  });
  const useCase = new UpdateInterviewQuestionUseCase({
    applicationRepository: makeApplicationRepository({
      findById: vi
        .fn()
        .mockResolvedValue(makeApplication({ userId: options?.ownerId ?? 'user-1' })),
    }),
    interviewRoundRepository: makeInterviewRoundRepository({
      findById: vi.fn().mockResolvedValue(options?.round ?? makeInterviewRound()),
    }),
    interviewQuestionRepository,
  });
  return { useCase, interviewQuestionRepository };
}

describe('UpdateInterviewQuestionUseCase', () => {
  it('throws NOT_FOUND for an unknown question', async () => {
    const { useCase } = makeUseCase({ question: null });

    const err = await useCase.execute({ userId: 'user-1', questionId: 'x' }).catch((e) => e);

    expect((err as { code: string }).code).toBe('NOT_FOUND');
  });

  it("throws FORBIDDEN for another user's question and changes nothing", async () => {
    const { useCase, interviewQuestionRepository } = makeUseCase({ ownerId: 'other-user' });

    const err = await useCase
      .execute({ userId: 'user-1', questionId: 'question-1', answer: 'x' })
      .catch((e) => e);

    expect((err as { code: string }).code).toBe('FORBIDDEN');
    expect(interviewQuestionRepository.update).not.toHaveBeenCalled();
  });

  it('adds an answer to a question that had none', async () => {
    const { useCase, interviewQuestionRepository } = makeUseCase();

    await useCase.execute({ userId: 'user-1', questionId: 'question-1', answer: ' My answer ' });

    expect(interviewQuestionRepository.update).toHaveBeenCalledWith('question-1', {
      question: undefined,
      answer: 'My answer',
    });
  });

  it('leaves the answer alone when it is omitted', async () => {
    const { useCase, interviewQuestionRepository } = makeUseCase();

    await useCase.execute({ userId: 'user-1', questionId: 'question-1', question: 'New wording' });

    expect(interviewQuestionRepository.update).toHaveBeenCalledWith('question-1', {
      question: 'New wording',
      answer: undefined,
    });
  });

  it('clears the answer when it is null or blank', async () => {
    const { useCase, interviewQuestionRepository } = makeUseCase();

    await useCase.execute({ userId: 'user-1', questionId: 'question-1', answer: null });
    await useCase.execute({ userId: 'user-1', questionId: 'question-1', answer: '  ' });

    expect(interviewQuestionRepository.update).toHaveBeenNthCalledWith(1, 'question-1', {
      question: undefined,
      answer: null,
    });
    expect(interviewQuestionRepository.update).toHaveBeenNthCalledWith(2, 'question-1', {
      question: undefined,
      answer: null,
    });
  });

  it('rejects a blank question', async () => {
    const { useCase, interviewQuestionRepository } = makeUseCase();

    const err = await useCase
      .execute({ userId: 'user-1', questionId: 'question-1', question: ' ' })
      .catch((e) => e);

    expect((err as { code: string }).code).toBe('VALIDATION');
    expect(interviewQuestionRepository.update).not.toHaveBeenCalled();
  });

  it('still edits a question after the round has finished', async () => {
    const { useCase, interviewQuestionRepository } = makeUseCase({
      round: makeInterviewRound({ outcome: 'failed', completedAt: new Date('2024-02-01') }),
    });

    await useCase.execute({ userId: 'user-1', questionId: 'question-1', answer: 'In hindsight' });

    expect(interviewQuestionRepository.update).toHaveBeenCalled();
  });
});
