import { builder } from '#src/http/schema/builder.js';
import { CALENDAR_PROVIDER } from '#src/http/constants.js';

export const CalendarProviderEnum = builder.enumType('CalendarProvider', {
  values: {
    [CALENDAR_PROVIDER.GOOGLE]: { value: CALENDAR_PROVIDER.GOOGLE },
    [CALENDAR_PROVIDER.MICROSOFT]: { value: CALENDAR_PROVIDER.MICROSOFT },
  },
});
