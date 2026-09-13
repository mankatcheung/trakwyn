import type {
  CalendarConnection,
  CalendarProvider,
} from '#src/domain/calendarConnection/CalendarConnection.js';

export interface CreateCalendarConnectionData {
  id: string;
  userId: string;
  provider: CalendarProvider;
  accessToken: string;
  refreshToken: string;
  accessTokenExpiresAt: Date;
  externalCalendarId: string;
}

export interface UpdateCalendarConnectionData {
  accessToken?: string;
  refreshToken?: string;
  accessTokenExpiresAt?: Date;
}

export interface ICalendarConnectionRepository {
  findAllByUserId(userId: string): Promise<CalendarConnection[]>;
  findByUserIdAndProvider(
    userId: string,
    provider: CalendarProvider,
  ): Promise<CalendarConnection | null>;
  findById(id: string): Promise<CalendarConnection | null>;
  /** Upserts on (userId, provider) — reconnecting replaces the stored tokens rather than erroring. */
  create(data: CreateCalendarConnectionData): Promise<CalendarConnection>;
  update(id: string, data: UpdateCalendarConnectionData): Promise<CalendarConnection>;
  delete(id: string): Promise<void>;
}
