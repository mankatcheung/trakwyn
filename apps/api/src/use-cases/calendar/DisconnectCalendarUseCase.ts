import { NotFoundError } from '#src/use-cases/errors/DomainError.js';
import type { ICalendarConnectionRepository } from '#src/use-cases/ports/ICalendarConnectionRepository.js';
import type { ICalendarSyncedEventRepository } from '#src/use-cases/ports/ICalendarSyncedEventRepository.js';
import type { ICalendarProviderRegistry } from '#src/use-cases/ports/ICalendarProviderRegistry.js';
import type { ILogger } from '#src/use-cases/ports/ILogger.js';
import type {
  DisconnectCalendarInput,
  IDisconnectCalendarUseCase,
} from '#src/use-cases/calendar/IDisconnectCalendarUseCase.js';

interface Deps {
  calendarConnectionRepository: ICalendarConnectionRepository;
  calendarSyncedEventRepository: ICalendarSyncedEventRepository;
  calendarProviderRegistry: ICalendarProviderRegistry;
  logger: ILogger;
}

/**
 * Disconnecting deletes previously synced events from the external calendar
 * (JEF-331 decision) — a clean teardown rather than leaving orphaned events
 * behind. A single event failing to delete upstream (revoked token, a 500 on
 * their side) does not block the rest: this server's own connection and
 * synced-event records are removed regardless, since the user asked this
 * server to stop touching their calendar, and that much is always within
 * this server's own control. Failures are logged, not thrown — the user
 * disconnecting should never itself fail.
 */
export class DisconnectCalendarUseCase implements IDisconnectCalendarUseCase {
  constructor(private readonly deps: Deps) {}

  async execute(input: DisconnectCalendarInput): Promise<void> {
    const connection = await this.deps.calendarConnectionRepository.findByUserIdAndProvider(
      input.userId,
      input.provider,
    );
    if (!connection) throw new NotFoundError('Calendar connection not found');

    const provider = this.deps.calendarProviderRegistry.get(input.provider);
    const syncedEvents = await this.deps.calendarSyncedEventRepository.findAllByConnectionId(
      connection.id,
    );

    for (const synced of syncedEvents) {
      try {
        await provider.deleteEvent(
          connection.accessToken,
          connection.externalCalendarId,
          synced.externalEventId,
        );
      } catch (err) {
        this.deps.logger.error(
          `Failed to delete synced ${input.provider} calendar event on disconnect`,
          err,
        );
      }
    }

    await this.deps.calendarSyncedEventRepository.deleteAllByConnectionId(connection.id);
    await this.deps.calendarConnectionRepository.delete(connection.id);
  }
}
