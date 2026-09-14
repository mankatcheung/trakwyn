import type { CalendarProvider } from '#src/domain/calendarConnection/CalendarConnection.js';
import type { ICalendarProvider } from '#src/use-cases/ports/ICalendarProvider.js';
import type { ICalendarProviderRegistry } from '#src/use-cases/ports/ICalendarProviderRegistry.js';
import { ERROR_CODES } from '#src/use-cases/errors/errorCodes.js';

interface Deps {
  googleCalendarProvider: ICalendarProvider;
}

export class CalendarProviderRegistry implements ICalendarProviderRegistry {
  constructor(private readonly deps: Deps) {}

  get(provider: CalendarProvider): ICalendarProvider {
    switch (provider) {
      case 'google':
        return this.deps.googleCalendarProvider;
      default:
        throw Object.assign(new Error(`Unknown calendar provider: ${String(provider)}`), {
          code: ERROR_CODES.VALIDATION,
        });
    }
  }
}
