import { describe, it, expect, vi } from 'vitest';
import { UpdateInterviewRoundUseCase } from '#src/use-cases/interviewRounds/UpdateInterviewRoundUseCase.js';
import {
  makeInterviewRound,
  makeInterviewRoundRepository,
} from '#src/__tests__/helpers/mocks/interviews.js';
import { makeApplication, makeApplicationRepository } from '#src/__tests__/helpers/mocks/jobs.js';
import { makeSyncCalendarEventUseCase } from '#src/__tests__/helpers/mocks/calendar.js';

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

describe('UpdateInterviewRoundUseCase calendar sync (JEF-331)', () => {
  const setup = (updated: ReturnType<typeof makeInterviewRound>) => {
    const syncCalendarEventUseCase = makeSyncCalendarEventUseCase();
    const useCase = new UpdateInterviewRoundUseCase({
      applicationRepository: makeApplicationRepository({
        findById: vi
          .fn()
          .mockResolvedValue(makeApplication({ userId: 'user-1', company: 'Acme', role: 'SWE' })),
      }),
      interviewRoundRepository: makeInterviewRoundRepository({
        findById: vi.fn().mockResolvedValue(makeInterviewRound({ id: 'round-1' })),
        update: vi.fn().mockResolvedValue(updated),
      }),
      syncCalendarEventUseCase,
    });
    return { useCase, syncCalendarEventUseCase };
  };

  it('pushes the new time to the calendar', async () => {
    const start = new Date('2030-06-01T14:00:00.000Z');
    const { useCase, syncCalendarEventUseCase } = setup(
      makeInterviewRound({ id: 'round-1', scheduledAt: start, notes: null }),
    );

    await useCase.execute({ userId: 'user-1', roundId: 'round-1', scheduledAt: start });

    expect(syncCalendarEventUseCase.execute).toHaveBeenCalledWith({
      userId: 'user-1',
      sourceType: 'interview',
      sourceId: 'round-1',
      event: {
        title: 'Interview: Acme — SWE',
        description: null,
        startAt: start,
        endAt: new Date('2030-06-01T15:00:00.000Z'),
      },
    });
  });

  it('removes the calendar event when the scheduled time is cleared', async () => {
    const { useCase, syncCalendarEventUseCase } = setup(
      makeInterviewRound({ id: 'round-1', scheduledAt: null }),
    );

    await useCase.execute({ userId: 'user-1', roundId: 'round-1', scheduledAt: null });

    expect(syncCalendarEventUseCase.execute).toHaveBeenCalledWith(
      expect.objectContaining({ sourceId: 'round-1', event: null }),
    );
  });
});
