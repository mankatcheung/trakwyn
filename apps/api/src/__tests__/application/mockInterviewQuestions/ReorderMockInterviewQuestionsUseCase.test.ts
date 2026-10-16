import { describe, it, expect, vi } from 'vitest';
import { ReorderMockInterviewQuestionsUseCase } from '#src/use-cases/mockInterviewQuestions/ReorderMockInterviewQuestionsUseCase.js';
import {
  makeMockInterviewQuestion,
  makeMockInterviewQuestionRepository,
  makeInterviewRound,
  makeInterviewRoundRepository,
} from '#src/__tests__/helpers/mocks/interviews.js';
import { makeApplication, makeApplicationRepository } from '#src/__tests__/helpers/mocks/jobs.js';

function makeUseCase(ownerId = 'user-1') {
  const mockInterviewQuestionRepository = makeMockInterviewQuestionRepository({
    findAllByRoundId: vi
      .fn()
      .mockResolvedValue([
        makeMockInterviewQuestion({ id: 'a', position: 0 }),
        makeMockInterviewQuestion({ id: 'b', position: 1 }),
        makeMockInterviewQuestion({ id: 'c', position: 2 }),
      ]),
  });
  const useCase = new ReorderMockInterviewQuestionsUseCase({
    applicationRepository: makeApplicationRepository({
      findById: vi.fn().mockResolvedValue(makeApplication({ userId: ownerId })),
    }),
    interviewRoundRepository: makeInterviewRoundRepository({
      findById: vi.fn().mockResolvedValue(makeInterviewRound()),
    }),
    mockInterviewQuestionRepository,
  });
  return { useCase, mockInterviewQuestionRepository };
}

describe('ReorderMockInterviewQuestionsUseCase', () => {
  it('saves the new order and returns the round re-read', async () => {
    const { useCase, mockInterviewQuestionRepository } = makeUseCase();

    const result = await useCase.execute({
      userId: 'user-1',
      roundId: 'round-1',
      orderedIds: ['c', 'a', 'b'],
    });

    expect(mockInterviewQuestionRepository.reorder).toHaveBeenCalledWith('round-1', [
      'c',
      'a',
      'b',
    ]);
    expect(result).toHaveLength(3);
  });

  it("throws FORBIDDEN for another user's round", async () => {
    const { useCase, mockInterviewQuestionRepository } = makeUseCase('other-user');

    const err = await useCase
      .execute({ userId: 'user-1', roundId: 'round-1', orderedIds: ['a', 'b', 'c'] })
      .catch((e) => e);

    expect((err as { code: string }).code).toBe('FORBIDDEN');
    expect(mockInterviewQuestionRepository.reorder).not.toHaveBeenCalled();
  });

  it.each([
    ['a missing id', ['a', 'b']],
    ['an extra id', ['a', 'b', 'c', 'd']],
    ['an id from another round', ['a', 'b', 'z']],
    ['a repeated id', ['a', 'a', 'b']],
    ['an empty list', []],
  ])('rejects %s', async (_label, orderedIds) => {
    const { useCase, mockInterviewQuestionRepository } = makeUseCase();

    const err = await useCase
      .execute({ userId: 'user-1', roundId: 'round-1', orderedIds })
      .catch((e) => e);

    expect((err as { code: string }).code).toBe('VALIDATION');
    expect(mockInterviewQuestionRepository.reorder).not.toHaveBeenCalled();
  });
});
