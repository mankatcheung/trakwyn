import type { CalendarConnection } from '#src/domain/calendarConnection/CalendarConnection.js';
import type { ICalendarConnectionRepository } from '#src/use-cases/ports/ICalendarConnectionRepository.js';
import type { ICalendarSyncedEventRepository } from '#src/use-cases/ports/ICalendarSyncedEventRepository.js';
import type { ICalendarProvider } from '#src/use-cases/ports/ICalendarProvider.js';
import type { ICalendarProviderRegistry } from '#src/use-cases/ports/ICalendarProviderRegistry.js';
import type { ILogger } from '#src/use-cases/ports/ILogger.js';
import type {
  ISyncCalendarEventUseCase,
  RemoveCalendarEventsInput,
  SyncCalendarEventInput,
} from '#src/use-cases/calendar/ISyncCalendarEventUseCase.js';

interface Deps {
  calendarConnectionRepository: ICalendarConnectionRepository;
  calendarSyncedEventRepository: ICalendarSyncedEventRepository;
  calendarProviderRegistry: ICalendarProviderRegistry;
  logger: ILogger;
  generateId: () => string;
}

/**
 * Pushes one interview change to every calendar the user has connected —
 * called inline, on the same write path as the change itself
 * (`Create/Update/DeleteInterviewRoundUseCase`, and
 * `PermanentlyDeleteApplicationUseCase` for the rounds it takes with it).
 *
 * Makes no LLM call and touches no AI credit or quota (JEF-331): it depends
 * only on calendar repositories, the provider registry and a logger.
 *
 * Deliberately fail-open (JEF-331 decision): a calendar API being briefly
 * down, or a token needing a refresh that itself fails, must never fail the
 * underlying application/interview save. Every per-connection failure is
 * caught and logged here — this method never throws — which is also why this
 * is the one calendar use case with no corresponding GraphQL mutation: it has
 * no caller that would do anything with a thrown error anyway.
 */
export class SyncCalendarEventUseCase implements ISyncCalendarEventUseCase {
  constructor(private readonly deps: Deps) {}

  async execute(input: SyncCalendarEventInput): Promise<void> {
    // The whole body, not just per-connection sync below, is inside the
    // fail-open boundary: even the connection lookup itself must never
    // reject, or a transient DB blip on this side path would fail the
    // application/interview save it was only supposed to mirror.
    try {
      const connections = await this.deps.calendarConnectionRepository.findAllByUserId(
        input.userId,
      );
      if (connections.length === 0) return;

      await Promise.all(
        connections.map((connection) =>
          this.syncOne(connection, input).catch((err) => {
            this.deps.logger.error(
              `Calendar sync failed for ${connection.provider} (${input.sourceType}:${input.sourceId})`,
              err,
            );
          }),
        ),
      );
    } catch (err) {
      this.deps.logger.error(
        `Calendar sync failed to look up connections (${input.sourceType}:${input.sourceId})`,
        err,
      );
    }
  }

  async removeMany(input: RemoveCalendarEventsInput): Promise<void> {
    if (input.sourceIds.length === 0) return;
    try {
      const connections = await this.deps.calendarConnectionRepository.findAllByUserId(
        input.userId,
      );
      await Promise.all(
        connections.map((connection) =>
          this.removeFromConnection(connection, input).catch((err) => {
            this.deps.logger.error(
              `Calendar cleanup failed for ${connection.provider} (${input.sourceType})`,
              err,
            );
          }),
        ),
      );
    } catch (err) {
      this.deps.logger.error(
        `Calendar cleanup failed to look up connections (${input.sourceType})`,
        err,
      );
    }
  }

  private async removeFromConnection(
    connection: CalendarConnection,
    input: RemoveCalendarEventsInput,
  ): Promise<void> {
    const provider = this.deps.calendarProviderRegistry.get(connection.provider);
    let accessToken: string | null = null;

    for (const sourceId of input.sourceIds) {
      try {
        const existing = await this.deps.calendarSyncedEventRepository.findBySource(
          connection.id,
          input.sourceType,
          sourceId,
        );
        if (!existing) continue;
        accessToken ??= await this.freshAccessToken(connection, provider);
        await provider.deleteEvent(
          accessToken,
          connection.externalCalendarId,
          existing.externalEventId,
        );
        await this.deps.calendarSyncedEventRepository.deleteBySource(
          connection.id,
          input.sourceType,
          sourceId,
        );
      } catch (err) {
        // One event failing must not strand the rest of the application's rounds.
        this.deps.logger.error(
          `Calendar cleanup failed for ${connection.provider} (${input.sourceType}:${sourceId})`,
          err,
        );
      }
    }
  }

  private async syncOne(
    connection: CalendarConnection,
    input: SyncCalendarEventInput,
  ): Promise<void> {
    const provider = this.deps.calendarProviderRegistry.get(connection.provider);
    const accessToken = await this.freshAccessToken(connection, provider);
    const existing = await this.deps.calendarSyncedEventRepository.findBySource(
      connection.id,
      input.sourceType,
      input.sourceId,
    );

    if (!input.event) {
      if (!existing) return;
      await provider.deleteEvent(
        accessToken,
        connection.externalCalendarId,
        existing.externalEventId,
      );
      await this.deps.calendarSyncedEventRepository.deleteBySource(
        connection.id,
        input.sourceType,
        input.sourceId,
      );
      return;
    }

    if (existing) {
      await provider.updateEvent(
        accessToken,
        connection.externalCalendarId,
        existing.externalEventId,
        input.event,
      );
      return;
    }

    const { externalEventId } = await provider.createEvent(
      accessToken,
      connection.externalCalendarId,
      input.event,
    );
    await this.deps.calendarSyncedEventRepository.upsert({
      id: this.deps.generateId(),
      calendarConnectionId: connection.id,
      sourceType: input.sourceType,
      sourceId: input.sourceId,
      externalEventId,
    });
  }

  /** Refreshes and persists a new access token when the stored one has expired; otherwise reuses it as-is. */
  private async freshAccessToken(
    connection: CalendarConnection,
    provider: ICalendarProvider,
  ): Promise<string> {
    if (connection.accessTokenExpiresAt.getTime() > Date.now()) {
      return connection.accessToken;
    }
    const refreshed = await provider.refreshAccessToken(connection.refreshToken);
    await this.deps.calendarConnectionRepository.update(connection.id, {
      accessToken: refreshed.accessToken,
      accessTokenExpiresAt: refreshed.accessTokenExpiresAt,
    });
    return refreshed.accessToken;
  }
}
