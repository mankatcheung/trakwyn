import { describe, it, expect, vi } from 'vitest';
import { GetInterviewRoundAnalyticsUseCase } from '#src/use-cases/interviewRounds/GetInterviewRoundAnalyticsUseCase.js';
import {
  makeInterviewRound,
  makeInterviewRoundRepository,
} from '#src/__tests__/helpers/mocks/interviews.js';
import { makeApplication, makeApplicationRepository } from '#src/__tests__/helpers/mocks/jobs.js';

describe('GetInterviewRoundAnalyticsUseCase', () => {
  it('returns empty byType and zero-sample terminal stats when there is no data', async () => {
    const applicationRepository = makeApplicationRepository({
      findAllByUserId: vi.fn().mockResolvedValue([]),
    });
    const interviewRoundRepository = makeInterviewRoundRepository({
      findAllByUserId: vi.fn().mockResolvedValue([]),
    });

    const result = await new GetInterviewRoundAnalyticsUseCase({
      applicationRepository,
      interviewRoundRepository,
    }).execute({ userId: 'user-1' });

    expect(result).toEqual({
      byType: [],
      roundsToOffer: { average: null, median: null, sampleSize: 0 },
      roundsToRejection: { average: null, median: null, sampleSize: 0 },
    });
  });

  it('only includes round types that have at least one round, with correct outcome counts', async () => {
    const rounds = [
      makeInterviewRound({ id: 'r1', type: 'phone', outcome: 'passed' }),
      makeInterviewRound({ id: 'r2', type: 'phone', outcome: 'passed' }),
      makeInterviewRound({ id: 'r3', type: 'phone', outcome: 'failed' }),
      makeInterviewRound({ id: 'r4', type: 'technical', outcome: 'pending' }),
      makeInterviewRound({ id: 'r5', type: 'onsite', outcome: 'cancelled' }),
    ];
    const applicationRepository = makeApplicationRepository({
      findAllByUserId: vi.fn().mockResolvedValue([]),
    });
    const interviewRoundRepository = makeInterviewRoundRepository({
      findAllByUserId: vi.fn().mockResolvedValue(rounds),
    });

    const result = await new GetInterviewRoundAnalyticsUseCase({
      applicationRepository,
      interviewRoundRepository,
    }).execute({ userId: 'user-1' });

    expect(result.byType).toEqual([
      { type: 'phone', passed: 2, failed: 1, pending: 0, cancelled: 0 },
      { type: 'technical', passed: 0, failed: 0, pending: 1, cancelled: 0 },
      { type: 'onsite', passed: 0, failed: 0, pending: 0, cancelled: 1 },
    ]);
  });

  it('computes average/median rounds-to-offer only for offered/accepted applications', async () => {
    const apps = [
      makeApplication({ id: 'app-1', status: 'offered' }),
      makeApplication({ id: 'app-2', status: 'accepted' }),
      makeApplication({ id: 'app-3', status: 'interviewing' }),
    ];
    const rounds = [
      makeInterviewRound({ id: 'r1', applicationId: 'app-1' }),
      makeInterviewRound({ id: 'r2', applicationId: 'app-1' }),
      makeInterviewRound({ id: 'r3', applicationId: 'app-2' }),
      makeInterviewRound({ id: 'r4', applicationId: 'app-2' }),
      makeInterviewRound({ id: 'r5', applicationId: 'app-2' }),
      makeInterviewRound({ id: 'r6', applicationId: 'app-2' }),
      makeInterviewRound({ id: 'r7', applicationId: 'app-3' }),
    ];
    const applicationRepository = makeApplicationRepository({
      findAllByUserId: vi.fn().mockResolvedValue(apps),
    });
    const interviewRoundRepository = makeInterviewRoundRepository({
      findAllByUserId: vi.fn().mockResolvedValue(rounds),
    });

    const result = await new GetInterviewRoundAnalyticsUseCase({
      applicationRepository,
      interviewRoundRepository,
    }).execute({ userId: 'user-1' });

    // app-1: 2 rounds, app-2: 4 rounds -> average 3, median 3
    expect(result.roundsToOffer).toEqual({ average: 3, median: 3, sampleSize: 2 });
    expect(result.roundsToRejection).toEqual({ average: null, median: null, sampleSize: 0 });
  });

  it('computes rounds-to-rejection and excludes withdrawn applications entirely', async () => {
    const apps = [
      makeApplication({ id: 'app-1', status: 'rejected' }),
      makeApplication({ id: 'app-2', status: 'rejected' }),
      makeApplication({ id: 'app-3', status: 'withdrawn' }),
    ];
    const rounds = [
      makeInterviewRound({ id: 'r1', applicationId: 'app-1' }),
      makeInterviewRound({ id: 'r2', applicationId: 'app-2' }),
      makeInterviewRound({ id: 'r3', applicationId: 'app-2' }),
      makeInterviewRound({ id: 'r4', applicationId: 'app-2' }),
      makeInterviewRound({ id: 'r5', applicationId: 'app-3' }),
    ];
    const applicationRepository = makeApplicationRepository({
      findAllByUserId: vi.fn().mockResolvedValue(apps),
    });
    const interviewRoundRepository = makeInterviewRoundRepository({
      findAllByUserId: vi.fn().mockResolvedValue(rounds),
    });

    const result = await new GetInterviewRoundAnalyticsUseCase({
      applicationRepository,
      interviewRoundRepository,
    }).execute({ userId: 'user-1' });

    // app-1: 1 round, app-2: 3 rounds -> average 2, median 2. app-3 (withdrawn) excluded.
    expect(result.roundsToRejection).toEqual({ average: 2, median: 2, sampleSize: 2 });
  });

  it('excludes applications with no interview rounds from terminal-state stats even if offered', async () => {
    const apps = [makeApplication({ id: 'app-1', status: 'offered' })];
    const applicationRepository = makeApplicationRepository({
      findAllByUserId: vi.fn().mockResolvedValue(apps),
    });
    const interviewRoundRepository = makeInterviewRoundRepository({
      findAllByUserId: vi.fn().mockResolvedValue([]),
    });

    const result = await new GetInterviewRoundAnalyticsUseCase({
      applicationRepository,
      interviewRoundRepository,
    }).execute({ userId: 'user-1' });

    expect(result.roundsToOffer.sampleSize).toBe(0);
  });
});
