import { describe, it, expect, vi } from 'vitest';
import { ReorderInterviewQuestionsUseCase } from '#src/use-cases/interviewQuestions/ReorderInterviewQuestionsUseCase.js';
import {
  makeInterviewQuestion,
  makeInterviewQuestionRepository,
  makeInterviewRound,
  makeInterviewRoundRepository,
} from '#src/__tests__/helpers/mocks/interviews.js';
import { makeApplication, makeApplicationRepository } from '#src/__tests__/helpers/mocks/jobs.js';

function makeUseCase(ownerId = 'user-1') {
  const interviewQuestionRepository = makeInterviewQuestionRepository({
    findAllByRoundId: vi
      .fn()
      .mockResolvedValue([
        makeInterviewQuestion({ id: 'a', position: 0 }),
        makeInterviewQuestion({ id: 'b', position: 1 }),
        makeInterviewQuestion({ id: 'c', position: 2 }),
      ]),
  });
  const useCase = new ReorderInterviewQuestionsUseCase({
    applicationRepository: makeApplicationRepository({
      findById: vi.fn().mockResolvedValue(makeApplication({ userId: ownerId })),
    }),
    interviewRoundRepository: makeInterviewRoundRepository({
      findById: vi.fn().mockResolvedValue(makeInterviewRound()),
    }),
    interviewQuestionRepository,
  });
  return { useCase, interviewQuestionRepository };
}

describe('ReorderInterviewQuestionsUseCase', () => {
  it('saves the new order and returns the round re-read', async () => {
    const { useCase, interviewQuestionRepository } = makeUseCase();

    const result = await useCase.execute({
      userId: 'user-1',
      roundId: 'round-1',
      orderedIds: ['c', 'a', 'b'],
    });

    expect(interviewQuestionRepository.reorder).toHaveBeenCalledWith('round-1', ['c', 'a', 'b']);
    expect(result).toHaveLength(3);
  });

  it("throws FORBIDDEN for another user's round", async () => {
    const { useCase, interviewQuestionRepository } = makeUseCase('other-user');

    const err = await useCase
      .execute({ userId: 'user-1', roundId: 'round-1', orderedIds: ['a', 'b', 'c'] })
      .catch((e) => e);

    expect((err as { code: string }).code).toBe('FORBIDDEN');
    expect(interviewQuestionRepository.reorder).not.toHaveBeenCalled();
  });

  it.each([
    ['a missing id', ['a', 'b']],
    ['an extra id', ['a', 'b', 'c', 'd']],
    ['an id from another round', ['a', 'b', 'z']],
    ['a repeated id', ['a', 'a', 'b']],
    ['an empty list', []],
  ])('rejects %s', async (_label, orderedIds) => {
    const { useCase, interviewQuestionRepository } = makeUseCase();

    const err = await useCase
      .execute({ userId: 'user-1', roundId: 'round-1', orderedIds })
      .catch((e) => e);

    expect((err as { code: string }).code).toBe('VALIDATION');
    expect(interviewQuestionRepository.reorder).not.toHaveBeenCalled();
  });
});
