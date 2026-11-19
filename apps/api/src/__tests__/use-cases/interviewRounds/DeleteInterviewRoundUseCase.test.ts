import { describe, it, expect, vi } from 'vitest';
import { DeleteInterviewRoundUseCase } from '#src/use-cases/interviewRounds/DeleteInterviewRoundUseCase.js';
import {
  makeInterviewRound,
  makeInterviewRoundRepository,
} from '#src/__tests__/helpers/mocks/interviews.js';
import { makeApplication, makeApplicationRepository } from '#src/__tests__/helpers/mocks/jobs.js';

describe('DeleteInterviewRoundUseCase', () => {
  it('throws NOT_FOUND when the round does not exist', async () => {
    const interviewRoundRepository = makeInterviewRoundRepository({
      findById: vi.fn().mockResolvedValue(null),
    });

    const useCase = new DeleteInterviewRoundUseCase({
      applicationRepository: makeApplicationRepository(),
      interviewRoundRepository,
    });
    const err = await useCase
      .execute({ userId: 'user-1', roundId: 'round-missing' })
      .catch((e) => e);

    expect(err).toBeInstanceOf(Error);
    expect((err as { code: string }).code).toBe('NOT_FOUND');
  });

  it('throws FORBIDDEN when the owning application belongs to another user', async () => {
    const interviewRoundRepository = makeInterviewRoundRepository({
      findById: vi.fn().mockResolvedValue(makeInterviewRound({ applicationId: 'app-1' })),
    });
    const applicationRepository = makeApplicationRepository({
      findById: vi.fn().mockResolvedValue(makeApplication({ userId: 'other-user' })),
    });

    const useCase = new DeleteInterviewRoundUseCase({
      applicationRepository,
      interviewRoundRepository,
    });
    const err = await useCase.execute({ userId: 'user-1', roundId: 'round-1' }).catch((e) => e);

    expect(err).toBeInstanceOf(Error);
    expect((err as { code: string }).code).toBe('FORBIDDEN');
  });

  it('throws FORBIDDEN when the owning application no longer exists', async () => {
    const interviewRoundRepository = makeInterviewRoundRepository({
      findById: vi.fn().mockResolvedValue(makeInterviewRound({ applicationId: 'app-1' })),
    });
    const applicationRepository = makeApplicationRepository({
      findById: vi.fn().mockResolvedValue(null),
    });

    const useCase = new DeleteInterviewRoundUseCase({
      applicationRepository,
      interviewRoundRepository,
    });
    const err = await useCase.execute({ userId: 'user-1', roundId: 'round-1' }).catch((e) => e);

    expect(err).toBeInstanceOf(Error);
    expect((err as { code: string }).code).toBe('FORBIDDEN');
  });

  it('deletes the round when the caller owns the application', async () => {
    const interviewRoundRepository = makeInterviewRoundRepository({
      findById: vi.fn().mockResolvedValue(makeInterviewRound({ applicationId: 'app-1' })),
    });
    const applicationRepository = makeApplicationRepository({
      findById: vi.fn().mockResolvedValue(makeApplication({ userId: 'user-1' })),
    });

    const useCase = new DeleteInterviewRoundUseCase({
      applicationRepository,
      interviewRoundRepository,
    });
    await useCase.execute({ userId: 'user-1', roundId: 'round-1' });

    expect(interviewRoundRepository.delete).toHaveBeenCalledWith('round-1', 'app-1');
  });
});
