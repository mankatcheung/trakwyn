import { describe, it, expect, vi } from 'vitest';
import { GetMockInterviewQuestionsUseCase } from '#src/use-cases/mockInterviewQuestions/GetMockInterviewQuestionsUseCase.js';
import {
  makeMockInterviewQuestion,
  makeMockInterviewQuestionRepository,
  makeInterviewRound,
  makeInterviewRoundRepository,
} from '#src/__tests__/helpers/mocks/interviews.js';
import { makeApplication, makeApplicationRepository } from '#src/__tests__/helpers/mocks/jobs.js';

function makeUseCase(options: {
  round?: ReturnType<typeof makeInterviewRound> | null;
  ownerId?: string;
}) {
  const questions = [
    makeMockInterviewQuestion({ id: 'q1' }),
    makeMockInterviewQuestion({ id: 'q2' }),
  ];
  const mockInterviewQuestionRepository = makeMockInterviewQuestionRepository({
    findAllByRoundId: vi.fn().mockResolvedValue(questions),
  });
  const useCase = new GetMockInterviewQuestionsUseCase({
    applicationRepository: makeApplicationRepository({
      findById: vi.fn().mockResolvedValue(makeApplication({ userId: options.ownerId ?? 'user-1' })),
    }),
    interviewRoundRepository: makeInterviewRoundRepository({
      findById: vi
        .fn()
        .mockResolvedValue('round' in options ? options.round : makeInterviewRound()),
    }),
    mockInterviewQuestionRepository,
  });
  return { useCase, mockInterviewQuestionRepository, questions };
}

describe('GetMockInterviewQuestionsUseCase', () => {
  it('returns the round questions for the owner', async () => {
    const { useCase, mockInterviewQuestionRepository, questions } = makeUseCase({});

    const result = await useCase.execute({ userId: 'user-1', roundId: 'round-1' });

    expect(result).toEqual(questions);
    expect(mockInterviewQuestionRepository.findAllByRoundId).toHaveBeenCalledWith('round-1');
  });

  it('throws NOT_FOUND for an unknown round', async () => {
    const { useCase } = makeUseCase({ round: null });

    const err = await useCase.execute({ userId: 'user-1', roundId: 'x' }).catch((e) => e);

    expect((err as { code: string }).code).toBe('NOT_FOUND');
  });

  it("throws FORBIDDEN for another user's round and reads nothing", async () => {
    const { useCase, mockInterviewQuestionRepository } = makeUseCase({ ownerId: 'other-user' });

    const err = await useCase.execute({ userId: 'user-1', roundId: 'round-1' }).catch((e) => e);

    expect((err as { code: string }).code).toBe('FORBIDDEN');
    expect(mockInterviewQuestionRepository.findAllByRoundId).not.toHaveBeenCalled();
  });

  it('works for a round that is already finished', async () => {
    const { useCase } = makeUseCase({
      round: makeInterviewRound({ outcome: 'passed', completedAt: new Date('2024-02-01') }),
    });

    const result = await useCase.execute({ userId: 'user-1', roundId: 'round-1' });

    expect(result).toHaveLength(2);
  });
});
