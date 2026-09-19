import { describe, it, expect } from 'vitest';
import { CalendarProviderRegistry } from '#src/infrastructure/calendar/CalendarProviderRegistry.js';
import { makeCalendarProvider } from '#src/__tests__/helpers/mocks/calendar.js';

describe('CalendarProviderRegistry', () => {
  it('resolves google to the google provider instance', () => {
    const googleCalendarProvider = makeCalendarProvider();
    const registry = new CalendarProviderRegistry({ googleCalendarProvider });

    expect(registry.get('google')).toBe(googleCalendarProvider);
  });

  it('throws VALIDATION for an unknown provider', () => {
    const registry = new CalendarProviderRegistry({
      googleCalendarProvider: makeCalendarProvider(),
    });

    let err: unknown;
    try {
      registry.get('twitter' as never);
    } catch (e) {
      err = e;
    }

    expect((err as { code: string }).code).toBe('VALIDATION');
  });
});
