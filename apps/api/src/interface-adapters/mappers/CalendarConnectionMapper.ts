import type {
  CalendarConnection,
  CalendarProvider,
} from '#src/domain/calendarConnection/CalendarConnection.js';

/** Never carries tokens — this is what the GraphQL API exposes, and tokens have no reason to leave the server. */
export interface CalendarConnectionDTO {
  provider: CalendarProvider;
  createdAt: string;
}

export class CalendarConnectionMapper {
  toDTO(connection: CalendarConnection): CalendarConnectionDTO {
    return {
      provider: connection.provider,
      createdAt: connection.createdAt.toISOString(),
    };
  }
}
