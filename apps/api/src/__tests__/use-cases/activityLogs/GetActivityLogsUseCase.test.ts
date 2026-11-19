import { describe, it, expect, vi } from 'vitest';
import { GetActivityLogsUseCase } from '#src/use-cases/activityLogs/GetActivityLogsUseCase.js';
import { makeActivityLogRepository } from '#src/__tests__/helpers/mocks/activity.js';
import { makeApplication, makeApplicationRepository } from '#src/__tests__/helpers/mocks/jobs.js';

describe('GetActivityLogsUseCase', () => {
  it('throws NOT_FOUND when the application does not exist', async () => {
    const applicationRepository = makeApplicationRepository({
      findById: vi.fn().mockResolvedValue(null),
    });

    const useCase = new GetActivityLogsUseCase({
      applicationRepository,
      activityLogRepository: makeActivityLogRepository(),
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

    const useCase = new GetActivityLogsUseCase({
      applicationRepository,
      activityLogRepository: makeActivityLogRepository(),
    });
    const err = await useCase.execute({ userId: 'user-1', applicationId: 'app-1' }).catch((e) => e);

    expect(err).toBeInstanceOf(Error);
    expect((err as { code: string }).code).toBe('FORBIDDEN');
  });

  it('returns all activity logs for the application', async () => {
    const logs = [
      {
        id: 'log-1',
        applicationId: 'app-1',
        actorId: 'user-1',
        eventType: 'note_added' as const,
        payload: '{}',
        createdAt: new Date('2024-01-01'),
      },
    ];
    const applicationRepository = makeApplicationRepository({
      findById: vi.fn().mockResolvedValue(makeApplication()),
    });
    const activityLogRepository = makeActivityLogRepository({
      findAllByApplicationId: vi.fn().mockResolvedValue(logs),
    });

    const useCase = new GetActivityLogsUseCase({ applicationRepository, activityLogRepository });
    const result = await useCase.execute({ userId: 'user-1', applicationId: 'app-1' });

    expect(result).toEqual(logs);
    expect(activityLogRepository.findAllByApplicationId).toHaveBeenCalledWith('app-1');
  });
});
