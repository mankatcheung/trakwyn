import type { CalendarProvider } from '#src/domain/calendarConnection/CalendarConnection.js';

export interface DisconnectCalendarInput {
  userId: string;
  provider: CalendarProvider;
}

export interface IDisconnectCalendarUseCase {
  execute(input: DisconnectCalendarInput): Promise<void>;
}
