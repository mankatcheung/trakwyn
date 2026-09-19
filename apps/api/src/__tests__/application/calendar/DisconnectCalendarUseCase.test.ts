import { describe, it, expect, vi } from 'vitest';
import { DisconnectCalendarUseCase } from '#src/use-cases/calendar/DisconnectCalendarUseCase.js';
import {
  makeCalendarConnection,
  makeCalendarConnectionRepository,
  makeCalendarProvider,
  makeCalendarProviderRegistry,
  makeCalendarSyncedEvent,
  makeCalendarSyncedEventRepository,
} from '#src/__tests__/helpers/mocks/calendar.js';
import { makeLogger } from '#src/__tests__/helpers/mocks/infrastructure.js';

describe('DisconnectCalendarUseCase', () => {
  it('deletes every synced event upstream, then the local records and the connection', async () => {
    const connection = makeCalendarConnection();
    const synced = [
      makeCalendarSyncedEvent({ id: 'se-1', sourceId: 'app-1', sourceType: 'applied' }),
      makeCalendarSyncedEvent({ id: 'se-2', sourceId: 'round-1', sourceType: 'interview' }),
    ];
    const calendarConnectionRepository = makeCalendarConnectionRepository({
      findByUserIdAndProvider: vi.fn().mockResolvedValue(connection),
    });
    const calendarSyncedEventRepository = makeCalendarSyncedEventRepository({
      findAllByConnectionId: vi.fn().mockResolvedValue(synced),
    });
    const provider = makeCalendarProvider();
    const useCase = new DisconnectCalendarUseCase({
      calendarConnectionRepository,
      calendarSyncedEventRepository,
      calendarProviderRegistry: makeCalendarProviderRegistry({
        get: vi.fn().mockReturnValue(provider),
      }),
      logger: makeLogger(),
    });

    await useCase.execute({ userId: 'user-1', provider: 'google' });

    expect(provider.deleteEvent).toHaveBeenCalledTimes(2);
    expect(calendarSyncedEventRepository.deleteAllByConnectionId).toHaveBeenCalledWith(
      connection.id,
    );
    expect(calendarConnectionRepository.delete).toHaveBeenCalledWith(connection.id);
  });

  it('still removes the connection when an upstream delete fails', async () => {
    const connection = makeCalendarConnection();
    const calendarConnectionRepository = makeCalendarConnectionRepository({
      findByUserIdAndProvider: vi.fn().mockResolvedValue(connection),
    });
    const calendarSyncedEventRepository = makeCalendarSyncedEventRepository({
      findAllByConnectionId: vi.fn().mockResolvedValue([makeCalendarSyncedEvent()]),
    });
    const provider = makeCalendarProvider({
      deleteEvent: vi.fn().mockRejectedValue(new Error('provider down')),
    });
    const logger = makeLogger();
    const useCase = new DisconnectCalendarUseCase({
      calendarConnectionRepository,
      calendarSyncedEventRepository,
      calendarProviderRegistry: makeCalendarProviderRegistry({
        get: vi.fn().mockReturnValue(provider),
      }),
      logger,
    });

    await expect(
      useCase.execute({ userId: 'user-1', provider: 'google' }),
    ).resolves.toBeUndefined();

    expect(logger.error).toHaveBeenCalled();
    expect(calendarConnectionRepository.delete).toHaveBeenCalledWith(connection.id);
  });

  it('throws NOT_FOUND when there is no connection for that provider', async () => {
    const useCase = new DisconnectCalendarUseCase({
      calendarConnectionRepository: makeCalendarConnectionRepository(),
      calendarSyncedEventRepository: makeCalendarSyncedEventRepository(),
      calendarProviderRegistry: makeCalendarProviderRegistry(),
      logger: makeLogger(),
    });

    const err = await useCase.execute({ userId: 'user-1', provider: 'google' }).catch((e) => e);

    expect((err as { code: string }).code).toBe('NOT_FOUND');
  });
});
