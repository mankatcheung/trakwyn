import { describe, it, expect, vi } from 'vitest';
import { CreateMockInterviewQuestionUseCase } from '#src/use-cases/mockInterviewQuestions/CreateMockInterviewQuestionUseCase.js';
import { QuotaExceededError } from '#src/use-cases/errors/DomainError.js';
import { INTERVIEW_QUESTION_LIMITS } from '#src/use-cases/constants.js';
import type { IMockInterviewQuestionRepository } from '#src/use-cases/ports/IMockInterviewQuestionRepository.js';
import {
  makeMockInterviewQuestion,
  makeMockInterviewQuestionRepository,
  makeInterviewRound,
  makeInterviewRoundRepository,
} from '#src/__tests__/helpers/mocks/interviews.js';
import { makeApplication, makeApplicationRepository } from '#src/__tests__/helpers/mocks/jobs.js';

function makeUseCase(overrides?: {
  round?: ReturnType<typeof makeInterviewRound> | null;
  ownerId?: string;
  create?: IMockInterviewQuestionRepository['create'];
}) {
  const round = overrides && 'round' in overrides ? overrides.round : makeInterviewRound();
  const mockInterviewQuestionRepository = makeMockInterviewQuestionRepository({
    create: overrides?.create ?? vi.fn().mockResolvedValue(makeMockInterviewQuestion()),
  });
  const useCase = new CreateMockInterviewQuestionUseCase({
    applicationRepository: makeApplicationRepository({
      findById: vi
        .fn()
        .mockResolvedValue(makeApplication({ userId: overrides?.ownerId ?? 'user-1' })),
    }),
    interviewRoundRepository: makeInterviewRoundRepository({
      findById: vi.fn().mockResolvedValue(round),
    }),
    mockInterviewQuestionRepository,
    generateId: vi.fn().mockReturnValue('question-1'),
  });
  return { useCase, mockInterviewQuestionRepository };
}

describe('CreateMockInterviewQuestionUseCase', () => {
  it('throws NOT_FOUND when the round does not exist', async () => {
    const { useCase } = makeUseCase({ round: null });

    const err = await useCase
      .execute({ userId: 'user-1', roundId: 'missing', question: 'Why us?' })
      .catch((e) => e);

    expect((err as { code: string }).code).toBe('NOT_FOUND');
  });

  it('throws FORBIDDEN when the round belongs to another user', async () => {
    const { useCase, mockInterviewQuestionRepository } = makeUseCase({ ownerId: 'other-user' });

    const err = await useCase
      .execute({ userId: 'user-1', roundId: 'round-1', question: 'Why us?' })
      .catch((e) => e);

    expect((err as { code: string }).code).toBe('FORBIDDEN');
    expect(mockInterviewQuestionRepository.create).not.toHaveBeenCalled();
  });

  it('creates a question without an answer', async () => {
    const { useCase, mockInterviewQuestionRepository } = makeUseCase();

    await useCase.execute({ userId: 'user-1', roundId: 'round-1', question: 'Why us?' });

    expect(mockInterviewQuestionRepository.create).toHaveBeenCalledWith({
      id: 'question-1',
      interviewRoundId: 'round-1',
      question: 'Why us?',
      answer: null,
      answerSource: 'user',
    });
  });

  it('records an answer written by the user as `user`', async () => {
    const { useCase, mockInterviewQuestionRepository } = makeUseCase();

    await useCase.execute({
      userId: 'user-1',
      roundId: 'round-1',
      question: 'Why us?',
      answer: 'Because.',
    });

    expect(mockInterviewQuestionRepository.create).toHaveBeenCalledWith(
      expect.objectContaining({ answer: 'Because.', answerSource: 'user' }),
    );
  });

  it('records an answer saved from an AI draft as `ai`', async () => {
    const { useCase, mockInterviewQuestionRepository } = makeUseCase();

    await useCase.execute({
      userId: 'user-1',
      roundId: 'round-1',
      question: 'Why us?',
      answer: 'Because.',
      answerSource: 'ai',
    });

    expect(mockInterviewQuestionRepository.create).toHaveBeenCalledWith(
      expect.objectContaining({ answerSource: 'ai' }),
    );
  });

  it('ignores `ai` when there is no answer for the label to describe', async () => {
    const { useCase, mockInterviewQuestionRepository } = makeUseCase();

    await useCase.execute({
      userId: 'user-1',
      roundId: 'round-1',
      question: 'Why us?',
      answer: '  ',
      answerSource: 'ai',
    });

    expect(mockInterviewQuestionRepository.create).toHaveBeenCalledWith(
      expect.objectContaining({ answer: null, answerSource: 'user' }),
    );
  });

  it('trims the question and answer', async () => {
    const { useCase, mockInterviewQuestionRepository } = makeUseCase();

    await useCase.execute({
      userId: 'user-1',
      roundId: 'round-1',
      question: '  Why us?  ',
      answer: '  Because.  ',
    });

    expect(mockInterviewQuestionRepository.create).toHaveBeenCalledWith(
      expect.objectContaining({ question: 'Why us?', answer: 'Because.' }),
    );
  });

  it('stores a blank answer as null', async () => {
    const { useCase, mockInterviewQuestionRepository } = makeUseCase();

    await useCase.execute({
      userId: 'user-1',
      roundId: 'round-1',
      question: 'Why us?',
      answer: '   ',
    });

    expect(mockInterviewQuestionRepository.create).toHaveBeenCalledWith(
      expect.objectContaining({ answer: null }),
    );
  });

  it('rejects a blank question', async () => {
    const { useCase, mockInterviewQuestionRepository } = makeUseCase();

    const err = await useCase
      .execute({ userId: 'user-1', roundId: 'round-1', question: '   ' })
      .catch((e) => e);

    expect((err as { code: string }).code).toBe('VALIDATION');
    expect(mockInterviewQuestionRepository.create).not.toHaveBeenCalled();
  });

  it('rejects a question over the length limit', async () => {
    const { useCase } = makeUseCase();

    const err = await useCase
      .execute({
        userId: 'user-1',
        roundId: 'round-1',
        question: 'q'.repeat(INTERVIEW_QUESTION_LIMITS.QUESTION_MAX_CHARS + 1),
      })
      .catch((e) => e);

    expect((err as { code: string }).code).toBe('VALIDATION');
  });

  it('rejects an answer over the length limit', async () => {
    const { useCase } = makeUseCase();

    const err = await useCase
      .execute({
        userId: 'user-1',
        roundId: 'round-1',
        question: 'Why us?',
        answer: 'a'.repeat(INTERVIEW_QUESTION_LIMITS.ANSWER_MAX_CHARS + 1),
      })
      .catch((e) => e);

    expect((err as { code: string }).code).toBe('VALIDATION');
  });

  it('propagates the quota error when the round is full', async () => {
    const { useCase } = makeUseCase({
      create: vi.fn().mockRejectedValue(new QuotaExceededError('full')),
    });

    const err = await useCase
      .execute({ userId: 'user-1', roundId: 'round-1', question: 'Why us?' })
      .catch((e) => e);

    expect(err).toBeInstanceOf(QuotaExceededError);
  });
});
