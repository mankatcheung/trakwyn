import { describe, it, expect, vi } from 'vitest';
import { UpdateInterviewRoundUseCase } from '#src/use-cases/interviewRounds/UpdateInterviewRoundUseCase.js';
import {
  makeInterviewRound,
  makeInterviewRoundRepository,
} from '#src/__tests__/helpers/mocks/interviews.js';
import { makeApplication, makeApplicationRepository } from '#src/__tests__/helpers/mocks/jobs.js';

describe('UpdateInterviewRoundUseCase', () => {
  it('throws NOT_FOUND when the round does not exist', async () => {
    const interviewRoundRepository = makeInterviewRoundRepository({
      findById: vi.fn().mockResolvedValue(null),
    });

    const useCase = new UpdateInterviewRoundUseCase({
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

    const useCase = new UpdateInterviewRoundUseCase({
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

    const useCase = new UpdateInterviewRoundUseCase({
      applicationRepository,
      interviewRoundRepository,
    });
    const err = await useCase.execute({ userId: 'user-1', roundId: 'round-1' }).catch((e) => e);

    expect(err).toBeInstanceOf(Error);
    expect((err as { code: string }).code).toBe('FORBIDDEN');
  });

  it('updates the round with the provided fields and returns the result', async () => {
    const existing = makeInterviewRound({ applicationId: 'app-1' });
    const updated = makeInterviewRound({ applicationId: 'app-1', outcome: 'passed' });
    const interviewRoundRepository = makeInterviewRoundRepository({
      findById: vi.fn().mockResolvedValue(existing),
      update: vi.fn().mockResolvedValue(updated),
    });
    const applicationRepository = makeApplicationRepository({
      findById: vi.fn().mockResolvedValue(makeApplication({ userId: 'user-1' })),
    });

    const useCase = new UpdateInterviewRoundUseCase({
      applicationRepository,
      interviewRoundRepository,
    });
    const result = await useCase.execute({
      userId: 'user-1',
      roundId: 'round-1',
      outcome: 'passed',
    });

    expect(result).toEqual(updated);
    expect(interviewRoundRepository.update).toHaveBeenCalledWith('round-1', {
      type: undefined,
      scheduledAt: undefined,
      completedAt: undefined,
      interviewerName: undefined,
      notes: undefined,
      outcome: 'passed',
    });
  });
});
