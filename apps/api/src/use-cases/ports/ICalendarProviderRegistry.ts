import type { CalendarProvider } from '#src/domain/calendarConnection/CalendarConnection.js';
import type { ICalendarProvider } from '#src/use-cases/ports/ICalendarProvider.js';

export interface ICalendarProviderRegistry {
  get(provider: CalendarProvider): ICalendarProvider;
}
