import { describe, it, expect, vi } from 'vitest';
import { GetResponseTimeAnalyticsUseCase } from '#src/use-cases/activityLogs/GetResponseTimeAnalyticsUseCase.js';
import { makeActivityLogRepository } from '#src/__tests__/helpers/mocks/activity.js';
import { makeApplication, makeApplicationRepository } from '#src/__tests__/helpers/mocks/jobs.js';
import type { ActivityLog } from '#src/domain/activityLog/ActivityLog.js';

const makeLog = (overrides: Partial<ActivityLog> = {}): ActivityLog => ({
  id: 'log-1',
  applicationId: 'app-1',
  actorId: 'user-1',
  eventType: 'status_changed',
  payload: JSON.stringify({ from: 'draft', to: 'applied' }),
  createdAt: new Date('2024-01-02T00:00:00Z'),
  ...overrides,
});

describe('GetResponseTimeAnalyticsUseCase', () => {
  it('returns empty stats when there is no data', async () => {
    const applicationRepository = makeApplicationRepository({
      findAllByUserId: vi.fn().mockResolvedValue([]),
    });
    const activityLogRepository = makeActivityLogRepository({
      findAllByUserId: vi.fn().mockResolvedValue([]),
    });

    const result = await new GetResponseTimeAnalyticsUseCase({
      applicationRepository,
      activityLogRepository,
    }).execute({ userId: 'user-1' });

    expect(result).toEqual({
      timeInStage: [],
      timeToFirstResponse: { averageDays: null, medianDays: null, sampleSize: 0 },
    });
  });

  it('computes time-in-stage from the initial status (createdAt) through each logged transition', async () => {
    const app = makeApplication({
      id: 'app-1',
      createdAt: new Date('2024-01-01T00:00:00Z'),
    });
    const logs = [
      makeLog({
        id: 'log-1',
        applicationId: 'app-1',
        payload: JSON.stringify({ from: 'draft', to: 'applied' }),
        createdAt: new Date('2024-01-03T00:00:00Z'), // 2 days in draft
      }),
      makeLog({
        id: 'log-2',
        applicationId: 'app-1',
        payload: JSON.stringify({ from: 'applied', to: 'interviewing' }),
        createdAt: new Date('2024-01-08T00:00:00Z'), // 5 days in applied
      }),
    ];
    const applicationRepository = makeApplicationRepository({
      findAllByUserId: vi.fn().mockResolvedValue([app]),
    });
    const activityLogRepository = makeActivityLogRepository({
      findAllByUserId: vi.fn().mockResolvedValue(logs),
    });

    const result = await new GetResponseTimeAnalyticsUseCase({
      applicationRepository,
      activityLogRepository,
    }).execute({ userId: 'user-1' });

    expect(result.timeInStage).toEqual(
      expect.arrayContaining([
        { status: 'draft', averageDays: 2, medianDays: 2, sampleSize: 1 },
        { status: 'applied', averageDays: 5, medianDays: 5, sampleSize: 1 },
      ]),
    );
    // interviewing is the current (still-in-progress) stage, so it should
    // not appear at all — it hasn't been exited yet.
    expect(result.timeInStage.find((s) => s.status === 'interviewing')).toBeUndefined();
  });

  it('excludes the current in-progress stage from time-in-stage (no synthetic zero)', async () => {
    const app = makeApplication({ id: 'app-1', createdAt: new Date('2024-01-01T00:00:00Z') });
    const applicationRepository = makeApplicationRepository({
      findAllByUserId: vi.fn().mockResolvedValue([app]),
    });
    const activityLogRepository = makeActivityLogRepository({
      findAllByUserId: vi.fn().mockResolvedValue([]),
    });

    const result = await new GetResponseTimeAnalyticsUseCase({
      applicationRepository,
      activityLogRepository,
    }).execute({ userId: 'user-1' });

    expect(result.timeInStage).toEqual([]);
  });

  it('computes time-to-first-response from appliedAt to the exit-from-applied event', async () => {
    const app = makeApplication({
      id: 'app-1',
      appliedAt: new Date('2024-01-02T00:00:00Z'),
    });
    const logs = [
      makeLog({
        id: 'log-1',
        applicationId: 'app-1',
        payload: JSON.stringify({ from: 'applied', to: 'interviewing' }),
        createdAt: new Date('2024-01-06T00:00:00Z'), // 4 days later
      }),
    ];
    const applicationRepository = makeApplicationRepository({
      findAllByUserId: vi.fn().mockResolvedValue([app]),
    });
    const activityLogRepository = makeActivityLogRepository({
      findAllByUserId: vi.fn().mockResolvedValue(logs),
    });

    const result = await new GetResponseTimeAnalyticsUseCase({
      applicationRepository,
      activityLogRepository,
    }).execute({ userId: 'user-1' });

    expect(result.timeToFirstResponse).toEqual({ averageDays: 4, medianDays: 4, sampleSize: 1 });
  });

  it('excludes applications from time-to-first-response when appliedAt is null or there is no exit-from-applied event', async () => {
    const stillApplied = makeApplication({ id: 'app-1', appliedAt: new Date('2024-01-01') });
    const neverApplied = makeApplication({ id: 'app-2', appliedAt: null });
    const applicationRepository = makeApplicationRepository({
      findAllByUserId: vi.fn().mockResolvedValue([stillApplied, neverApplied]),
    });
    const activityLogRepository = makeActivityLogRepository({
      findAllByUserId: vi.fn().mockResolvedValue([]),
    });

    const result = await new GetResponseTimeAnalyticsUseCase({
      applicationRepository,
      activityLogRepository,
    }).execute({ userId: 'user-1' });

    expect(result.timeToFirstResponse.sampleSize).toBe(0);
  });

  it('ignores non-status_changed events and malformed payloads', async () => {
    const app = makeApplication({ id: 'app-1', createdAt: new Date('2024-01-01T00:00:00Z') });
    const logs = [
      makeLog({ id: 'log-1', applicationId: 'app-1', eventType: 'note_added', payload: '{}' }),
      makeLog({
        id: 'log-2',
        applicationId: 'app-1',
        eventType: 'status_changed',
        payload: 'not json',
      }),
    ];
    const applicationRepository = makeApplicationRepository({
      findAllByUserId: vi.fn().mockResolvedValue([app]),
    });
    const activityLogRepository = makeActivityLogRepository({
      findAllByUserId: vi.fn().mockResolvedValue(logs),
    });

    const result = await new GetResponseTimeAnalyticsUseCase({
      applicationRepository,
      activityLogRepository,
    }).execute({ userId: 'user-1' });

    expect(result.timeInStage).toEqual([]);
  });
});
