import { asClass, Lifetime, type NameAndRegistrationPair } from 'awilix';

import { ConnectCalendarUseCase } from '#src/use-cases/calendar/ConnectCalendarUseCase.js';
import { DisconnectCalendarUseCase } from '#src/use-cases/calendar/DisconnectCalendarUseCase.js';
import { ListCalendarConnectionsUseCase } from '#src/use-cases/calendar/ListCalendarConnectionsUseCase.js';
import { SyncCalendarEventUseCase } from '#src/use-cases/calendar/SyncCalendarEventUseCase.js';

import type { Cradle } from '../types.js';

export const calendar = {
  connectCalendarUseCase: asClass(ConnectCalendarUseCase, { lifetime: Lifetime.TRANSIENT }),
  disconnectCalendarUseCase: asClass(DisconnectCalendarUseCase, { lifetime: Lifetime.TRANSIENT }),
  listCalendarConnectionsUseCase: asClass(ListCalendarConnectionsUseCase, {
    lifetime: Lifetime.TRANSIENT,
  }),
  syncCalendarEventUseCase: asClass(SyncCalendarEventUseCase, { lifetime: Lifetime.TRANSIENT }),
} satisfies NameAndRegistrationPair<Cradle>;
