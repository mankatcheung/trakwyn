import { describe, it, expect, vi } from 'vitest';
import { UpdateMockInterviewQuestionUseCase } from '#src/use-cases/mockInterviewQuestions/UpdateMockInterviewQuestionUseCase.js';
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
  round?: ReturnType<typeof makeInterviewRound>;
}) {
  const mockInterviewQuestionRepository = makeMockInterviewQuestionRepository({
    findById: vi
      .fn()
      .mockResolvedValue(
        options && 'question' in options ? options.question : makeMockInterviewQuestion(),
      ),
    update: vi.fn().mockResolvedValue(makeMockInterviewQuestion({ answer: 'updated' })),
  });
  const useCase = new UpdateMockInterviewQuestionUseCase({
    applicationRepository: makeApplicationRepository({
      findById: vi
        .fn()
        .mockResolvedValue(makeApplication({ userId: options?.ownerId ?? 'user-1' })),
    }),
    interviewRoundRepository: makeInterviewRoundRepository({
      findById: vi.fn().mockResolvedValue(options?.round ?? makeInterviewRound()),
    }),
    mockInterviewQuestionRepository,
  });
  return { useCase, mockInterviewQuestionRepository };
}

describe('UpdateMockInterviewQuestionUseCase', () => {
  it('throws NOT_FOUND for an unknown question', async () => {
    const { useCase } = makeUseCase({ question: null });

    const err = await useCase.execute({ userId: 'user-1', questionId: 'x' }).catch((e) => e);

    expect((err as { code: string }).code).toBe('NOT_FOUND');
  });

  it("throws FORBIDDEN for another user's question and changes nothing", async () => {
    const { useCase, mockInterviewQuestionRepository } = makeUseCase({ ownerId: 'other-user' });

    const err = await useCase
      .execute({ userId: 'user-1', questionId: 'question-1', answer: 'x' })
      .catch((e) => e);

    expect((err as { code: string }).code).toBe('FORBIDDEN');
    expect(mockInterviewQuestionRepository.update).not.toHaveBeenCalled();
  });

  it('adds an answer to a question that had none', async () => {
    const { useCase, mockInterviewQuestionRepository } = makeUseCase();

    await useCase.execute({ userId: 'user-1', questionId: 'question-1', answer: ' My answer ' });

    expect(mockInterviewQuestionRepository.update).toHaveBeenCalledWith('question-1', {
      question: undefined,
      answer: 'My answer',
      answerSource: undefined,
    });
  });

  it('keeps the stored label when only the answer text is edited', async () => {
    const { useCase, mockInterviewQuestionRepository } = makeUseCase();

    await useCase.execute({ userId: 'user-1', questionId: 'question-1', answer: 'Reworded' });

    // `undefined` means the repository leaves the column alone, so an `ai` answer stays `ai`.
    expect(mockInterviewQuestionRepository.update).toHaveBeenCalledWith(
      'question-1',
      expect.objectContaining({ answer: 'Reworded', answerSource: undefined }),
    );
  });

  it('marks the answer `ai` when an AI draft is saved', async () => {
    const { useCase, mockInterviewQuestionRepository } = makeUseCase();

    await useCase.execute({
      userId: 'user-1',
      questionId: 'question-1',
      answer: 'Drafted',
      answerSource: 'ai',
    });

    expect(mockInterviewQuestionRepository.update).toHaveBeenCalledWith(
      'question-1',
      expect.objectContaining({ answer: 'Drafted', answerSource: 'ai' }),
    );
  });

  it('does not change the label when no answer is sent', async () => {
    const { useCase, mockInterviewQuestionRepository } = makeUseCase();

    await useCase.execute({
      userId: 'user-1',
      questionId: 'question-1',
      question: 'New wording',
      answerSource: 'ai',
    });

    expect(mockInterviewQuestionRepository.update).toHaveBeenCalledWith('question-1', {
      question: 'New wording',
      answer: undefined,
      answerSource: undefined,
    });
  });

  it('leaves the answer alone when it is omitted', async () => {
    const { useCase, mockInterviewQuestionRepository } = makeUseCase();

    await useCase.execute({ userId: 'user-1', questionId: 'question-1', question: 'New wording' });

    expect(mockInterviewQuestionRepository.update).toHaveBeenCalledWith('question-1', {
      question: 'New wording',
      answer: undefined,
      answerSource: undefined,
    });
  });

  it('clears the answer, and resets the label to `user`, when it is null or blank', async () => {
    const { useCase, mockInterviewQuestionRepository } = makeUseCase();

    await useCase.execute({ userId: 'user-1', questionId: 'question-1', answer: null });
    await useCase.execute({ userId: 'user-1', questionId: 'question-1', answer: '  ' });

    expect(mockInterviewQuestionRepository.update).toHaveBeenNthCalledWith(1, 'question-1', {
      question: undefined,
      answer: null,
      answerSource: 'user',
    });
    expect(mockInterviewQuestionRepository.update).toHaveBeenNthCalledWith(2, 'question-1', {
      question: undefined,
      answer: null,
      answerSource: 'user',
    });
  });

  it('rejects a blank question', async () => {
    const { useCase, mockInterviewQuestionRepository } = makeUseCase();

    const err = await useCase
      .execute({ userId: 'user-1', questionId: 'question-1', question: ' ' })
      .catch((e) => e);

    expect((err as { code: string }).code).toBe('VALIDATION');
    expect(mockInterviewQuestionRepository.update).not.toHaveBeenCalled();
  });

  it('still edits a question after the round has finished', async () => {
    const { useCase, mockInterviewQuestionRepository } = makeUseCase({
      round: makeInterviewRound({ outcome: 'failed', completedAt: new Date('2024-02-01') }),
    });

    await useCase.execute({ userId: 'user-1', questionId: 'question-1', answer: 'In hindsight' });

    expect(mockInterviewQuestionRepository.update).toHaveBeenCalled();
  });
});
