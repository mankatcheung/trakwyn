import { describe, it, expect, vi } from 'vitest';
import { GetInterviewRoundsUseCase } from '#src/use-cases/interviewRounds/GetInterviewRoundsUseCase.js';
import {
  makeInterviewRound,
  makeInterviewRoundRepository,
} from '#src/__tests__/helpers/mocks/interviews.js';
import { makeApplication, makeApplicationRepository } from '#src/__tests__/helpers/mocks/jobs.js';

describe('GetInterviewRoundsUseCase', () => {
  it('throws NOT_FOUND when the application does not exist', async () => {
    const applicationRepository = makeApplicationRepository({
      findById: vi.fn().mockResolvedValue(null),
    });

    const useCase = new GetInterviewRoundsUseCase({
      applicationRepository,
      interviewRoundRepository: makeInterviewRoundRepository(),
    });
    const err = await useCase
      .execute({ userId: 'user-1', applicationId: 'app-missing' })
      .catch((e) => e);

    expect(err).toBeInstanceOf(Error);
    expect((err as { code: string }).code).toBe('NOT_FOUND');
  });

  it('throws FORBIDDEN when the application belongs to another user', async () => {
    const applicationRepository = makeApplicationRepository({
      findById: vi.fn().mockResolvedValue(makeApplication({ userId: 'other-user' })),
    });

    const useCase = new GetInterviewRoundsUseCase({
      applicationRepository,
      interviewRoundRepository: makeInterviewRoundRepository(),
    });
    const err = await useCase.execute({ userId: 'user-1', applicationId: 'app-1' }).catch((e) => e);

    expect(err).toBeInstanceOf(Error);
    expect((err as { code: string }).code).toBe('FORBIDDEN');
  });

  it('returns all rounds for the application', async () => {
    const rounds = [makeInterviewRound({ id: 'round-1' }), makeInterviewRound({ id: 'round-2' })];
    const applicationRepository = makeApplicationRepository({
      findById: vi.fn().mockResolvedValue(makeApplication()),
    });
    const interviewRoundRepository = makeInterviewRoundRepository({
      findAllByApplicationId: vi.fn().mockResolvedValue(rounds),
    });

    const useCase = new GetInterviewRoundsUseCase({
      applicationRepository,
      interviewRoundRepository,
    });
    const result = await useCase.execute({ userId: 'user-1', applicationId: 'app-1' });

    expect(result).toEqual(rounds);
    expect(interviewRoundRepository.findAllByApplicationId).toHaveBeenCalledWith('app-1');
  });
});
