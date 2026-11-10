import type { CalendarProvider } from '#src/domain/calendarConnection/CalendarConnection.js';

export interface ConnectCalendarInput {
  userId: string;
  provider: CalendarProvider;
  code: string;
  redirectUri: string;
  codeVerifier: string;
}

export interface IConnectCalendarUseCase {
  execute(input: ConnectCalendarInput): Promise<void>;
}
