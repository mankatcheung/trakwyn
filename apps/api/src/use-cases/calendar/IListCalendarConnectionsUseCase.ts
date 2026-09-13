import type { CalendarConnection } from '#src/domain/calendarConnection/CalendarConnection.js';

export interface IListCalendarConnectionsUseCase {
  execute(userId: string): Promise<CalendarConnection[]>;
}
