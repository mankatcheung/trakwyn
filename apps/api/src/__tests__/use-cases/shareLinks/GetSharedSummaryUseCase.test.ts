import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createHash } from 'crypto';
import { GetSharedSummaryUseCase } from '#src/use-cases/shareLinks/GetSharedSummaryUseCase.js';
import {
  makeInterviewRound,
  makeInterviewRoundRepository,
} from '#src/__tests__/helpers/mocks/interviews.js';
import { makeApplication, makeApplicationRepository } from '#src/__tests__/helpers/mocks/jobs.js';
import { makeShareLink, makeShareLinkRepository } from '#src/__tests__/helpers/mocks/shareLinks.js';

const NOW = new Date('2024-06-15T12:00:00.000Z');

describe('GetSharedSummaryUseCase', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns null when the token hash is not found', async () => {
    const shareLinkRepository = makeShareLinkRepository({
      findByTokenHash: vi.fn().mockResolvedValue(null),
    });
    const useCase = new GetSharedSummaryUseCase({
      shareLinkRepository,
      applicationRepository: makeApplicationRepository(),
      interviewRoundRepository: makeInterviewRoundRepository(),
    });

    const result = await useCase.execute('jfsl_unknown');

    expect(result).toBeNull();
    expect(shareLinkRepository.updateLastUsed).not.toHaveBeenCalled();
  });

  it('looks up the link by the sha256 hash of the raw token', async () => {
    const rawToken = 'jfsl_abc123';
    const expectedHash = createHash('sha256').update(rawToken).digest('hex');
    const link = makeShareLink({ id: 'share-link-1', userId: 'user-1' });
    const shareLinkRepository = makeShareLinkRepository({
      findByTokenHash: vi
        .fn()
        .mockImplementation(async (hash: string) => (hash === expectedHash ? link : null)),
    });
    const useCase = new GetSharedSummaryUseCase({
      shareLinkRepository,
      applicationRepository: makeApplicationRepository({
        findAllByUserId: vi.fn().mockResolvedValue([]),
      }),
      interviewRoundRepository: makeInterviewRoundRepository({
        findAllByUserId: vi.fn().mockResolvedValue([]),
      }),
    });

    const result = await useCase.execute(rawToken);

    expect(result).not.toBeNull();
    expect(shareLinkRepository.updateLastUsed).toHaveBeenCalledWith('share-link-1');
  });

  it('computes status counts, totals, upcoming interviews, and recent activity — never leaking per-application fields', async () => {
    const link = makeShareLink({ userId: 'user-1' });
    const shareLinkRepository = makeShareLinkRepository({
      findByTokenHash: vi.fn().mockResolvedValue(link),
    });
    const applications = [
      makeApplication({
        id: 'app-1',
        status: 'applied',
        updatedAt: new Date('2024-06-14T00:00:00.000Z'), // within last 7 days
      }),
      makeApplication({
        id: 'app-2',
        status: 'applied',
        updatedAt: new Date('2024-01-01T00:00:00.000Z'), // stale
      }),
      makeApplication({
        id: 'app-3',
        status: 'interviewing',
        updatedAt: new Date('2024-06-10T00:00:00.000Z'), // within last 7 days
      }),
    ];
    const interviewRounds = [
      makeInterviewRound({
        id: 'round-1',
        outcome: 'pending',
        scheduledAt: new Date('2024-06-20T00:00:00.000Z'), // future, upcoming
      }),
      makeInterviewRound({
        id: 'round-2',
        outcome: 'passed',
        scheduledAt: new Date('2024-06-20T00:00:00.000Z'), // future but not pending
      }),
      makeInterviewRound({
        id: 'round-3',
        outcome: 'pending',
        scheduledAt: new Date('2024-01-01T00:00:00.000Z'), // pending but in the past
      }),
      makeInterviewRound({ id: 'round-4', outcome: 'pending', scheduledAt: null }),
    ];
    const applicationRepository = makeApplicationRepository({
      findAllByUserId: vi.fn().mockResolvedValue(applications),
    });
    const interviewRoundRepository = makeInterviewRoundRepository({
      findAllByUserId: vi.fn().mockResolvedValue(interviewRounds),
    });
    const useCase = new GetSharedSummaryUseCase({
      shareLinkRepository,
      applicationRepository,
      interviewRoundRepository,
    });

    const result = await useCase.execute('jfsl_any');

    expect(applicationRepository.findAllByUserId).toHaveBeenCalledWith('user-1');
    expect(interviewRoundRepository.findAllByUserId).toHaveBeenCalledWith('user-1');
    expect(result!.totalApplications).toBe(3);
    expect(result!.totalInterviews).toBe(4);
    expect(result!.upcomingInterviews).toBe(1);
    expect(result!.applicationsUpdatedLast7Days).toBe(2);
    expect(result!.statusCounts).toEqual(
      expect.arrayContaining([
        { status: 'applied', count: 2 },
        { status: 'interviewing', count: 1 },
        { status: 'draft', count: 0 },
      ]),
    );
    expect(result!.generatedAt).toEqual(NOW);

    // The result must never contain company/role/notes/salary — only the
    // aggregate fields defined on SharedSummary.
    expect(Object.keys(result!).sort()).toEqual(
      [
        'statusCounts',
        'totalApplications',
        'totalInterviews',
        'upcomingInterviews',
        'applicationsUpdatedLast7Days',
        'generatedAt',
      ].sort(),
    );
  });
});
