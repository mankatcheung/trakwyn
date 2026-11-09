import { builder } from '#src/http/schema/builder.js';
import type { CalendarConnectionDTO } from '#src/interface-adapters/mappers/CalendarConnectionMapper.js';
import { CalendarProviderEnum } from '#src/http/schema/types/enums/CalendarProviderEnum.js';

export const CalendarConnectionRef = builder.objectRef<CalendarConnectionDTO>('CalendarConnection');
CalendarConnectionRef.implement({
  fields: (t) => ({
    provider: t.expose('provider', { type: CalendarProviderEnum }),
    createdAt: t.exposeString('createdAt'),
  }),
});
