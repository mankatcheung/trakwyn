import { describe, it, expect, vi } from 'vitest';
import { GetCalendarEventsUseCase } from '#src/use-cases/calendar/GetCalendarEventsUseCase.js';
import {
  makeInterviewRound,
  makeInterviewRoundRepository,
} from '#src/__tests__/helpers/mocks/interviews.js';
import { makeApplication, makeApplicationRepository } from '#src/__tests__/helpers/mocks/jobs.js';

describe('GetCalendarEventsUseCase', () => {
  it('returns an empty list when there are no applications or interview rounds', async () => {
    const applicationRepository = makeApplicationRepository({
      findAllByUserId: vi.fn().mockResolvedValue([]),
    });
    const interviewRoundRepository = makeInterviewRoundRepository({
      findAllByUserId: vi.fn().mockResolvedValue([]),
    });

    const result = await new GetCalendarEventsUseCase({
      applicationRepository,
      interviewRoundRepository,
    }).execute({ userId: 'user-1' });

    expect(result).toEqual([]);
  });

  it('emits an applied event for an application with appliedAt set', async () => {
    const app = makeApplication({ id: 'app-1', appliedAt: new Date('2024-03-01') });
    const applicationRepository = makeApplicationRepository({
      findAllByUserId: vi.fn().mockResolvedValue([app]),
    });
    const interviewRoundRepository = makeInterviewRoundRepository({
      findAllByUserId: vi.fn().mockResolvedValue([]),
    });

    const result = await new GetCalendarEventsUseCase({
      applicationRepository,
      interviewRoundRepository,
    }).execute({ userId: 'user-1' });

    expect(result).toEqual([
      {
        id: 'app-1-applied',
        applicationId: 'app-1',
        company: 'Acme Corp',
        role: 'Software Engineer',
        type: 'applied',
        date: new Date('2024-03-01'),
      },
    ]);
  });

  it('emits a followUp event for an application with followUpAt set', async () => {
    const app = makeApplication({ id: 'app-1', followUpAt: new Date('2024-03-10') });
    const applicationRepository = makeApplicationRepository({
      findAllByUserId: vi.fn().mockResolvedValue([app]),
    });
    const interviewRoundRepository = makeInterviewRoundRepository({
      findAllByUserId: vi.fn().mockResolvedValue([]),
    });

    const result = await new GetCalendarEventsUseCase({
      applicationRepository,
      interviewRoundRepository,
    }).execute({ userId: 'user-1' });

    expect(result).toEqual([
      {
        id: 'app-1-follow-up',
        applicationId: 'app-1',
        company: 'Acme Corp',
        role: 'Software Engineer',
        type: 'followUp',
        date: new Date('2024-03-10'),
      },
    ]);
  });

  it('emits an interview event for a scheduled interview round, carrying its type and the owning application', async () => {
    const app = makeApplication({ id: 'app-1', company: 'Globex', role: 'Backend Engineer' });
    const round = makeInterviewRound({
      id: 'round-1',
      applicationId: 'app-1',
      type: 'technical',
      scheduledAt: new Date('2024-03-15T10:00:00.000Z'),
    });
    const applicationRepository = makeApplicationRepository({
      findAllByUserId: vi.fn().mockResolvedValue([app]),
    });
    const interviewRoundRepository = makeInterviewRoundRepository({
      findAllByUserId: vi.fn().mockResolvedValue([round]),
    });

    const result = await new GetCalendarEventsUseCase({
      applicationRepository,
      interviewRoundRepository,
    }).execute({ userId: 'user-1' });

    expect(result).toEqual([
      {
        id: 'round-1',
        applicationId: 'app-1',
        company: 'Globex',
        role: 'Backend Engineer',
        type: 'interview',
        date: new Date('2024-03-15T10:00:00.000Z'),
        interviewRoundType: 'technical',
      },
    ]);
  });

  it('skips interview rounds with no scheduledAt', async () => {
    const app = makeApplication({ id: 'app-1' });
    const round = makeInterviewRound({ id: 'round-1', applicationId: 'app-1', scheduledAt: null });
    const applicationRepository = makeApplicationRepository({
      findAllByUserId: vi.fn().mockResolvedValue([app]),
    });
    const interviewRoundRepository = makeInterviewRoundRepository({
      findAllByUserId: vi.fn().mockResolvedValue([round]),
    });

    const result = await new GetCalendarEventsUseCase({
      applicationRepository,
      interviewRoundRepository,
    }).execute({ userId: 'user-1' });

    expect(result).toEqual([]);
  });

  it('combines applied, followUp, and interview events across multiple applications, sorted by date', async () => {
    const app1 = makeApplication({
      id: 'app-1',
      company: 'Acme',
      appliedAt: new Date('2024-03-05'),
      followUpAt: new Date('2024-03-20'),
    });
    const app2 = makeApplication({
      id: 'app-2',
      company: 'Globex',
      appliedAt: new Date('2024-03-01'),
    });
    const round = makeInterviewRound({
      id: 'round-1',
      applicationId: 'app-2',
      type: 'onsite',
      scheduledAt: new Date('2024-03-10'),
    });
    const applicationRepository = makeApplicationRepository({
      findAllByUserId: vi.fn().mockResolvedValue([app1, app2]),
    });
    const interviewRoundRepository = makeInterviewRoundRepository({
      findAllByUserId: vi.fn().mockResolvedValue([round]),
    });

    const result = await new GetCalendarEventsUseCase({
      applicationRepository,
      interviewRoundRepository,
    }).execute({ userId: 'user-1' });

    expect(result.map((e) => e.id)).toEqual([
      'app-2-applied',
      'app-1-applied',
      'round-1',
      'app-1-follow-up',
    ]);
  });
});
