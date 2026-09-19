import { describe, it, expect, vi } from 'vitest';
import { SyncCalendarEventUseCase } from '#src/use-cases/calendar/SyncCalendarEventUseCase.js';
import {
  makeCalendarConnection,
  makeCalendarConnectionRepository,
  makeCalendarProvider,
  makeCalendarProviderRegistry,
  makeCalendarSyncedEvent,
  makeCalendarSyncedEventRepository,
} from '#src/__tests__/helpers/mocks/calendar.js';
import { makeLogger } from '#src/__tests__/helpers/mocks/infrastructure.js';

const event = {
  title: 'Interview: Acme — SWE',
  description: null,
  startAt: new Date('2025-01-01T10:00:00Z'),
  endAt: new Date('2025-01-01T11:00:00Z'),
};

describe('SyncCalendarEventUseCase', () => {
  it('is a no-op when the user has no connected calendars', async () => {
    const calendarConnectionRepository = makeCalendarConnectionRepository();
    const calendarProviderRegistry = makeCalendarProviderRegistry();
    const useCase = new SyncCalendarEventUseCase({
      calendarConnectionRepository,
      calendarSyncedEventRepository: makeCalendarSyncedEventRepository(),
      calendarProviderRegistry,
      logger: makeLogger(),
      generateId: vi.fn(),
    });

    await useCase.execute({
      userId: 'user-1',
      sourceType: 'interview',
      sourceId: 'round-1',
      event,
    });

    expect(calendarProviderRegistry.get).not.toHaveBeenCalled();
  });

  it('creates a new external event when none is synced yet', async () => {
    const connection = makeCalendarConnection();
    const provider = makeCalendarProvider();
    const calendarSyncedEventRepository = makeCalendarSyncedEventRepository();
    const useCase = new SyncCalendarEventUseCase({
      calendarConnectionRepository: makeCalendarConnectionRepository({
        findAllByUserId: vi.fn().mockResolvedValue([connection]),
      }),
      calendarSyncedEventRepository,
      calendarProviderRegistry: makeCalendarProviderRegistry({
        get: vi.fn().mockReturnValue(provider),
      }),
      logger: makeLogger(),
      generateId: vi.fn().mockReturnValue('synced-1'),
    });

    await useCase.execute({
      userId: 'user-1',
      sourceType: 'interview',
      sourceId: 'round-1',
      event,
    });

    expect(provider.createEvent).toHaveBeenCalledWith(connection.accessToken, 'primary', event);
    expect(calendarSyncedEventRepository.upsert).toHaveBeenCalledWith({
      id: 'synced-1',
      calendarConnectionId: connection.id,
      sourceType: 'interview',
      sourceId: 'round-1',
      externalEventId: 'external-event-1',
    });
  });

  it('updates the existing external event when one is already synced', async () => {
    const connection = makeCalendarConnection();
    const provider = makeCalendarProvider();
    const existing = makeCalendarSyncedEvent();
    const useCase = new SyncCalendarEventUseCase({
      calendarConnectionRepository: makeCalendarConnectionRepository({
        findAllByUserId: vi.fn().mockResolvedValue([connection]),
      }),
      calendarSyncedEventRepository: makeCalendarSyncedEventRepository({
        findBySource: vi.fn().mockResolvedValue(existing),
      }),
      calendarProviderRegistry: makeCalendarProviderRegistry({
        get: vi.fn().mockReturnValue(provider),
      }),
      logger: makeLogger(),
      generateId: vi.fn(),
    });

    await useCase.execute({
      userId: 'user-1',
      sourceType: 'interview',
      sourceId: 'round-1',
      event,
    });

    expect(provider.updateEvent).toHaveBeenCalledWith(
      connection.accessToken,
      'primary',
      existing.externalEventId,
      event,
    );
    expect(provider.createEvent).not.toHaveBeenCalled();
  });

  it('deletes the existing external event when the event is null', async () => {
    const connection = makeCalendarConnection();
    const provider = makeCalendarProvider();
    const existing = makeCalendarSyncedEvent();
    const calendarSyncedEventRepository = makeCalendarSyncedEventRepository({
      findBySource: vi.fn().mockResolvedValue(existing),
    });
    const useCase = new SyncCalendarEventUseCase({
      calendarConnectionRepository: makeCalendarConnectionRepository({
        findAllByUserId: vi.fn().mockResolvedValue([connection]),
      }),
      calendarSyncedEventRepository,
      calendarProviderRegistry: makeCalendarProviderRegistry({
        get: vi.fn().mockReturnValue(provider),
      }),
      logger: makeLogger(),
      generateId: vi.fn(),
    });

    await useCase.execute({
      userId: 'user-1',
      sourceType: 'interview',
      sourceId: 'round-1',
      event: null,
    });

    expect(provider.deleteEvent).toHaveBeenCalledWith(
      connection.accessToken,
      'primary',
      existing.externalEventId,
    );
    expect(calendarSyncedEventRepository.deleteBySource).toHaveBeenCalledWith(
      connection.id,
      'interview',
      'round-1',
    );
  });

  it('refreshes an expired access token before syncing and persists the new one', async () => {
    const connection = makeCalendarConnection({ accessTokenExpiresAt: new Date('2000-01-01') });
    const provider = makeCalendarProvider();
    const calendarConnectionRepository = makeCalendarConnectionRepository({
      findAllByUserId: vi.fn().mockResolvedValue([connection]),
    });
    const useCase = new SyncCalendarEventUseCase({
      calendarConnectionRepository,
      calendarSyncedEventRepository: makeCalendarSyncedEventRepository(),
      calendarProviderRegistry: makeCalendarProviderRegistry({
        get: vi.fn().mockReturnValue(provider),
      }),
      logger: makeLogger(),
      generateId: vi.fn().mockReturnValue('synced-1'),
    });

    await useCase.execute({
      userId: 'user-1',
      sourceType: 'interview',
      sourceId: 'round-1',
      event,
    });

    expect(provider.refreshAccessToken).toHaveBeenCalledWith(connection.refreshToken);
    expect(calendarConnectionRepository.update).toHaveBeenCalledWith(connection.id, {
      accessToken: 'refreshed-access-token',
      accessTokenExpiresAt: new Date('2099-01-01'),
    });
    expect(provider.createEvent).toHaveBeenCalledWith('refreshed-access-token', 'primary', event);
  });

  it('never throws — a provider failure is logged, not propagated', async () => {
    const connection = makeCalendarConnection();
    const provider = makeCalendarProvider({
      createEvent: vi.fn().mockRejectedValue(new Error('provider down')),
    });
    const logger = makeLogger();
    const useCase = new SyncCalendarEventUseCase({
      calendarConnectionRepository: makeCalendarConnectionRepository({
        findAllByUserId: vi.fn().mockResolvedValue([connection]),
      }),
      calendarSyncedEventRepository: makeCalendarSyncedEventRepository(),
      calendarProviderRegistry: makeCalendarProviderRegistry({
        get: vi.fn().mockReturnValue(provider),
      }),
      logger,
      generateId: vi.fn(),
    });

    await expect(
      useCase.execute({ userId: 'user-1', sourceType: 'interview', sourceId: 'round-1', event }),
    ).resolves.toBeUndefined();

    expect(logger.error).toHaveBeenCalled();
  });

  it('never throws even when the connection lookup itself fails', async () => {
    const logger = makeLogger();
    const useCase = new SyncCalendarEventUseCase({
      calendarConnectionRepository: makeCalendarConnectionRepository({
        findAllByUserId: vi.fn().mockRejectedValue(new Error('db down')),
      }),
      calendarSyncedEventRepository: makeCalendarSyncedEventRepository(),
      calendarProviderRegistry: makeCalendarProviderRegistry(),
      logger,
      generateId: vi.fn(),
    });

    await expect(
      useCase.execute({ userId: 'user-1', sourceType: 'interview', sourceId: 'round-1', event }),
    ).resolves.toBeUndefined();

    expect(logger.error).toHaveBeenCalled();
  });
});
