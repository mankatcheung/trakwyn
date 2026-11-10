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

describe('SyncCalendarEventUseCase.removeMany', () => {
  const build = (over: {
    provider?: ReturnType<typeof makeCalendarProvider>;
    syncedEvents?: Record<string, string>;
    logger?: ReturnType<typeof makeLogger>;
    connection?: ReturnType<typeof makeCalendarConnection>;
  }) => {
    const provider = over.provider ?? makeCalendarProvider();
    const logger = over.logger ?? makeLogger();
    const calendarSyncedEventRepository = makeCalendarSyncedEventRepository({
      findBySource: vi.fn().mockImplementation((_c: string, _t: string, sourceId: string) => {
        const externalEventId = over.syncedEvents?.[sourceId];
        return Promise.resolve(
          externalEventId ? makeCalendarSyncedEvent({ sourceId, externalEventId }) : null,
        );
      }),
    });
    const calendarConnectionRepository = makeCalendarConnectionRepository({
      findAllByUserId: vi.fn().mockResolvedValue([over.connection ?? makeCalendarConnection()]),
    });
    const useCase = new SyncCalendarEventUseCase({
      calendarConnectionRepository,
      calendarSyncedEventRepository,
      calendarProviderRegistry: makeCalendarProviderRegistry({
        get: vi.fn().mockReturnValue(provider),
      }),
      logger,
      generateId: vi.fn(),
    });
    return {
      useCase,
      provider,
      logger,
      calendarSyncedEventRepository,
      calendarConnectionRepository,
    };
  };

  it('deletes the external event and the tracking row for each source that was synced', async () => {
    const ctx = build({ syncedEvents: { 'round-1': 'ext-1', 'round-2': 'ext-2' } });

    await ctx.useCase.removeMany({
      userId: 'user-1',
      sourceType: 'interview',
      sourceIds: ['round-1', 'round-2', 'round-never-synced'],
    });

    expect(ctx.provider.deleteEvent).toHaveBeenCalledTimes(2);
    expect(ctx.provider.deleteEvent).toHaveBeenCalledWith(
      expect.any(String),
      expect.any(String),
      'ext-1',
    );
    expect(ctx.calendarSyncedEventRepository.deleteBySource).toHaveBeenCalledTimes(2);
  });

  it('does nothing for an empty list, without even loading the connections', async () => {
    const ctx = build({});

    await ctx.useCase.removeMany({ userId: 'user-1', sourceType: 'interview', sourceIds: [] });

    expect(ctx.calendarConnectionRepository.findAllByUserId).not.toHaveBeenCalled();
  });

  it('keeps going when one event fails, and never throws', async () => {
    const provider = makeCalendarProvider({
      deleteEvent: vi
        .fn()
        .mockRejectedValueOnce(new Error('Google is down'))
        .mockResolvedValue(undefined),
    });
    const ctx = build({ provider, syncedEvents: { 'round-1': 'ext-1', 'round-2': 'ext-2' } });

    await expect(
      ctx.useCase.removeMany({
        userId: 'user-1',
        sourceType: 'interview',
        sourceIds: ['round-1', 'round-2'],
      }),
    ).resolves.toBeUndefined();

    expect(provider.deleteEvent).toHaveBeenCalledTimes(2);
    expect(ctx.logger.error).toHaveBeenCalledTimes(1);
    // The failed one keeps its tracking row, so nothing claims it is gone.
    expect(ctx.calendarSyncedEventRepository.deleteBySource).toHaveBeenCalledTimes(1);
  });

  it('refreshes an expired access token once for the whole batch', async () => {
    const provider = makeCalendarProvider({
      refreshAccessToken: vi.fn().mockResolvedValue({
        accessToken: 'fresh',
        accessTokenExpiresAt: new Date('2099-01-01T00:00:00Z'),
      }),
    });
    const ctx = build({
      provider,
      syncedEvents: { 'round-1': 'ext-1', 'round-2': 'ext-2' },
      connection: makeCalendarConnection({
        accessTokenExpiresAt: new Date('2000-01-01T00:00:00Z'),
      }),
    });

    await ctx.useCase.removeMany({
      userId: 'user-1',
      sourceType: 'interview',
      sourceIds: ['round-1', 'round-2'],
    });

    expect(provider.refreshAccessToken).toHaveBeenCalledTimes(1);
    expect(provider.deleteEvent).toHaveBeenCalledWith('fresh', expect.any(String), 'ext-1');
  });

  it('never throws even when the connection lookup fails', async () => {
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
      useCase.removeMany({ userId: 'user-1', sourceType: 'interview', sourceIds: ['round-1'] }),
    ).resolves.toBeUndefined();
    expect(logger.error).toHaveBeenCalled();
  });
});
