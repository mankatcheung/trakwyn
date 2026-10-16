import { describe, it, expect, vi } from 'vitest';
import { CreateInterviewQuestionUseCase } from '#src/use-cases/interviewQuestions/CreateInterviewQuestionUseCase.js';
import { QuotaExceededError } from '#src/use-cases/errors/DomainError.js';
import { INTERVIEW_QUESTION_LIMITS } from '#src/use-cases/constants.js';
import type { IInterviewQuestionRepository } from '#src/use-cases/ports/IInterviewQuestionRepository.js';
import {
  makeInterviewQuestion,
  makeInterviewQuestionRepository,
  makeInterviewRound,
  makeInterviewRoundRepository,
} from '#src/__tests__/helpers/mocks/interviews.js';
import { makeApplication, makeApplicationRepository } from '#src/__tests__/helpers/mocks/jobs.js';

function makeUseCase(overrides?: {
  round?: ReturnType<typeof makeInterviewRound> | null;
  ownerId?: string;
  create?: IInterviewQuestionRepository['create'];
}) {
  const round = overrides && 'round' in overrides ? overrides.round : makeInterviewRound();
  const interviewQuestionRepository = makeInterviewQuestionRepository({
    create: overrides?.create ?? vi.fn().mockResolvedValue(makeInterviewQuestion()),
  });
  const useCase = new CreateInterviewQuestionUseCase({
    applicationRepository: makeApplicationRepository({
      findById: vi
        .fn()
        .mockResolvedValue(makeApplication({ userId: overrides?.ownerId ?? 'user-1' })),
    }),
    interviewRoundRepository: makeInterviewRoundRepository({
      findById: vi.fn().mockResolvedValue(round),
    }),
    interviewQuestionRepository,
    generateId: vi.fn().mockReturnValue('question-1'),
  });
  return { useCase, interviewQuestionRepository };
}

describe('CreateInterviewQuestionUseCase', () => {
  it('throws NOT_FOUND when the round does not exist', async () => {
    const { useCase } = makeUseCase({ round: null });

    const err = await useCase
      .execute({ userId: 'user-1', roundId: 'missing', question: 'Why us?' })
      .catch((e) => e);

    expect((err as { code: string }).code).toBe('NOT_FOUND');
  });

  it('throws FORBIDDEN when the round belongs to another user', async () => {
    const { useCase, interviewQuestionRepository } = makeUseCase({ ownerId: 'other-user' });

    const err = await useCase
      .execute({ userId: 'user-1', roundId: 'round-1', question: 'Why us?' })
      .catch((e) => e);

    expect((err as { code: string }).code).toBe('FORBIDDEN');
    expect(interviewQuestionRepository.create).not.toHaveBeenCalled();
  });

  it('creates a question without an answer', async () => {
    const { useCase, interviewQuestionRepository } = makeUseCase();

    await useCase.execute({ userId: 'user-1', roundId: 'round-1', question: 'Why us?' });

    expect(interviewQuestionRepository.create).toHaveBeenCalledWith({
      id: 'question-1',
      interviewRoundId: 'round-1',
      question: 'Why us?',
      answer: null,
    });
  });

  it('trims the question and answer', async () => {
    const { useCase, interviewQuestionRepository } = makeUseCase();

    await useCase.execute({
      userId: 'user-1',
      roundId: 'round-1',
      question: '  Why us?  ',
      answer: '  Because.  ',
    });

    expect(interviewQuestionRepository.create).toHaveBeenCalledWith(
      expect.objectContaining({ question: 'Why us?', answer: 'Because.' }),
    );
  });

  it('stores a blank answer as null', async () => {
    const { useCase, interviewQuestionRepository } = makeUseCase();

    await useCase.execute({
      userId: 'user-1',
      roundId: 'round-1',
      question: 'Why us?',
      answer: '   ',
    });

    expect(interviewQuestionRepository.create).toHaveBeenCalledWith(
      expect.objectContaining({ answer: null }),
    );
  });

  it('rejects a blank question', async () => {
    const { useCase, interviewQuestionRepository } = makeUseCase();

    const err = await useCase
      .execute({ userId: 'user-1', roundId: 'round-1', question: '   ' })
      .catch((e) => e);

    expect((err as { code: string }).code).toBe('VALIDATION');
    expect(interviewQuestionRepository.create).not.toHaveBeenCalled();
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
