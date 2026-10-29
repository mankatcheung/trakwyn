import { describe, it, expect, vi } from 'vitest';
import { CreateInterviewRoundUseCase } from '#src/use-cases/interviewRounds/CreateInterviewRoundUseCase.js';
import { makeActivityLogRepository } from '#src/__tests__/helpers/mocks/activity.js';
import {
  makeInterviewRound,
  makeInterviewRoundRepository,
} from '#src/__tests__/helpers/mocks/interviews.js';
import { makeApplication, makeApplicationRepository } from '#src/__tests__/helpers/mocks/jobs.js';

describe('CreateInterviewRoundUseCase', () => {
  it('throws NOT_FOUND when the application does not exist', async () => {
    const applicationRepository = makeApplicationRepository({
      findById: vi.fn().mockResolvedValue(null),
    });

    const useCase = new CreateInterviewRoundUseCase({
      applicationRepository,
      interviewRoundRepository: makeInterviewRoundRepository(),
      generateId: vi.fn(),
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

    const useCase = new CreateInterviewRoundUseCase({
      applicationRepository,
      interviewRoundRepository: makeInterviewRoundRepository(),
      generateId: vi.fn(),
    });
    const err = await useCase.execute({ userId: 'user-1', applicationId: 'app-1' }).catch((e) => e);

    expect(err).toBeInstanceOf(Error);
    expect((err as { code: string }).code).toBe('FORBIDDEN');
  });

  it('creates a round with defaults when type and outcome are omitted', async () => {
    const round = makeInterviewRound();
    const applicationRepository = makeApplicationRepository({
      findById: vi.fn().mockResolvedValue(makeApplication()),
    });
    const interviewRoundRepository = makeInterviewRoundRepository({
      create: vi.fn().mockResolvedValue(round),
    });
    const generateId = vi.fn().mockReturnValue('round-1');

    const useCase = new CreateInterviewRoundUseCase({
      applicationRepository,
      interviewRoundRepository,
      generateId,
    });
    const result = await useCase.execute({ userId: 'user-1', applicationId: 'app-1' });

    expect(result).toEqual(round);
    expect(interviewRoundRepository.create).toHaveBeenCalledWith({
      id: 'round-1',
      applicationId: 'app-1',
      type: 'other',
      scheduledAt: null,
      completedAt: null,
      interviewerName: null,
      notes: null,
      outcome: 'pending',
    });
  });

  it('passes through explicit fields instead of defaults', async () => {
    const scheduledAt = new Date('2024-06-01T10:00:00.000Z');
    const applicationRepository = makeApplicationRepository({
      findById: vi.fn().mockResolvedValue(makeApplication()),
    });
    const interviewRoundRepository = makeInterviewRoundRepository({
      create: vi.fn().mockResolvedValue(makeInterviewRound()),
    });

    const useCase = new CreateInterviewRoundUseCase({
      applicationRepository,
      interviewRoundRepository,
      generateId: vi.fn().mockReturnValue('round-1'),
    });
    await useCase.execute({
      userId: 'user-1',
      applicationId: 'app-1',
      type: 'technical',
      scheduledAt,
      interviewerName: 'Jane Doe',
      outcome: 'passed',
    });

    expect(interviewRoundRepository.create).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'technical',
        scheduledAt,
        interviewerName: 'Jane Doe',
        outcome: 'passed',
      }),
    );
  });

  it('appends an activity log entry when activityLogRepository is provided', async () => {
    const round = makeInterviewRound({ id: 'round-1', type: 'phone' });
    const applicationRepository = makeApplicationRepository({
      findById: vi.fn().mockResolvedValue(makeApplication()),
    });
    const interviewRoundRepository = makeInterviewRoundRepository({
      create: vi.fn().mockResolvedValue(round),
    });
    const activityLogRepository = makeActivityLogRepository();
    const generateId = vi.fn().mockReturnValueOnce('round-1').mockReturnValueOnce('log-1');

    const useCase = new CreateInterviewRoundUseCase({
      applicationRepository,
      interviewRoundRepository,
      activityLogRepository,
      generateId,
    });
    await useCase.execute({ userId: 'user-1', applicationId: 'app-1' });

    expect(activityLogRepository.append).toHaveBeenCalledWith({
      id: 'log-1',
      applicationId: 'app-1',
      actorId: 'user-1',
      eventType: 'interview_added',
      payload: JSON.stringify({ roundId: 'round-1', type: 'phone' }),
    });
  });

  it('does not throw when activityLogRepository is omitted', async () => {
    const applicationRepository = makeApplicationRepository({
      findById: vi.fn().mockResolvedValue(makeApplication()),
    });
    const interviewRoundRepository = makeInterviewRoundRepository({
      create: vi.fn().mockResolvedValue(makeInterviewRound()),
    });

    const useCase = new CreateInterviewRoundUseCase({
      applicationRepository,
      interviewRoundRepository,
      generateId: vi.fn().mockReturnValue('round-1'),
    });

    await expect(useCase.execute({ userId: 'user-1', applicationId: 'app-1' })).resolves.toEqual(
      expect.anything(),
    );
  });

  it('records the MCP source and token in the activity log (JEF-466)', async () => {
    const actor = { source: 'mcp' as const, apiTokenId: 'tok-1', apiTokenName: 'Claude Desktop' };
    const activityLogRepository = makeActivityLogRepository();
    const useCase = new CreateInterviewRoundUseCase({
      applicationRepository: makeApplicationRepository({
        findById: vi.fn().mockResolvedValue(makeApplication()),
      }),
      interviewRoundRepository: makeInterviewRoundRepository({
        create: vi.fn().mockResolvedValue(makeInterviewRound({ id: 'round-1', type: 'phone' })),
      }),
      activityLogRepository,
      generateId: vi.fn().mockReturnValue('id-1'),
    });
    await useCase.execute({ userId: 'user-1', applicationId: 'app-1', actor });

    expect(activityLogRepository.append).toHaveBeenCalledWith(
      expect.objectContaining({
        payload: JSON.stringify({ roundId: 'round-1', type: 'phone', ...actor }),
      }),
    );
  });
});
