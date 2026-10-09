import { describe, it, expect, vi } from 'vitest';
import { GetInterviewQuestionsUseCase } from '#src/use-cases/interviewQuestions/GetInterviewQuestionsUseCase.js';
import {
  makeInterviewQuestion,
  makeInterviewQuestionRepository,
  makeInterviewRound,
  makeInterviewRoundRepository,
} from '#src/__tests__/helpers/mocks/interviews.js';
import { makeApplication, makeApplicationRepository } from '#src/__tests__/helpers/mocks/jobs.js';

function makeUseCase(options: {
  round?: ReturnType<typeof makeInterviewRound> | null;
  ownerId?: string;
}) {
  const questions = [makeInterviewQuestion({ id: 'q1' }), makeInterviewQuestion({ id: 'q2' })];
  const interviewQuestionRepository = makeInterviewQuestionRepository({
    findAllByRoundId: vi.fn().mockResolvedValue(questions),
  });
  const useCase = new GetInterviewQuestionsUseCase({
    applicationRepository: makeApplicationRepository({
      findById: vi.fn().mockResolvedValue(makeApplication({ userId: options.ownerId ?? 'user-1' })),
    }),
    interviewRoundRepository: makeInterviewRoundRepository({
      findById: vi
        .fn()
        .mockResolvedValue('round' in options ? options.round : makeInterviewRound()),
    }),
    interviewQuestionRepository,
  });
  return { useCase, interviewQuestionRepository, questions };
}

describe('GetInterviewQuestionsUseCase', () => {
  it('returns the round questions for the owner', async () => {
    const { useCase, interviewQuestionRepository, questions } = makeUseCase({});

    const result = await useCase.execute({ userId: 'user-1', roundId: 'round-1' });

    expect(result).toEqual(questions);
    expect(interviewQuestionRepository.findAllByRoundId).toHaveBeenCalledWith('round-1');
  });

  it('throws NOT_FOUND for an unknown round', async () => {
    const { useCase } = makeUseCase({ round: null });

    const err = await useCase.execute({ userId: 'user-1', roundId: 'x' }).catch((e) => e);

    expect((err as { code: string }).code).toBe('NOT_FOUND');
  });

  it("throws FORBIDDEN for another user's round and reads nothing", async () => {
    const { useCase, interviewQuestionRepository } = makeUseCase({ ownerId: 'other-user' });

    const err = await useCase.execute({ userId: 'user-1', roundId: 'round-1' }).catch((e) => e);

    expect((err as { code: string }).code).toBe('FORBIDDEN');
    expect(interviewQuestionRepository.findAllByRoundId).not.toHaveBeenCalled();
  });

  it('works for a round that is already finished', async () => {
    const { useCase } = makeUseCase({
      round: makeInterviewRound({ outcome: 'passed', completedAt: new Date('2024-02-01') }),
    });

    const result = await useCase.execute({ userId: 'user-1', roundId: 'round-1' });

    expect(result).toHaveLength(2);
  });
});
