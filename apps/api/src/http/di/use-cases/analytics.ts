import { asClass, Lifetime, type NameAndRegistrationPair } from 'awilix';

import { ComputeHealthScoreUseCase } from '#src/use-cases/application/ComputeHealthScoreUseCase.js';
import { ComputeResumeMatchScoreUseCase } from '#src/use-cases/application/ComputeResumeMatchScoreUseCase.js';
import { ComputeResumeAtsScoreUseCase } from '#src/use-cases/application/ComputeResumeAtsScoreUseCase.js';
import { GetResumeAtsScoresUseCase } from '#src/use-cases/application/GetResumeAtsScoresUseCase.js';
import { GetResumeMatchesUseCase } from '#src/use-cases/application/GetResumeMatchesUseCase.js';
import { GetApplicationChannelAnalyticsUseCase } from '#src/use-cases/application/GetApplicationChannelAnalyticsUseCase.js';
import { GetCalendarEventsUseCase } from '#src/use-cases/calendar/GetCalendarEventsUseCase.js';
import { SendWeeklyDigestUseCase } from '#src/use-cases/digest/SendWeeklyDigestUseCase.js';

import type { Cradle } from '../types.js';

export const analytics = {
  computeHealthScoreUseCase: asClass(ComputeHealthScoreUseCase, {
    lifetime: Lifetime.TRANSIENT,
  }),
  computeResumeMatchScoreUseCase: asClass(ComputeResumeMatchScoreUseCase, {
    lifetime: Lifetime.TRANSIENT,
  }),
  computeResumeAtsScoreUseCase: asClass(ComputeResumeAtsScoreUseCase, {
    lifetime: Lifetime.TRANSIENT,
  }),
  getResumeAtsScoresUseCase: asClass(GetResumeAtsScoresUseCase, {
    lifetime: Lifetime.TRANSIENT,
  }),
  getResumeMatchesUseCase: asClass(GetResumeMatchesUseCase, {
    lifetime: Lifetime.TRANSIENT,
  }),
  getApplicationChannelAnalyticsUseCase: asClass(GetApplicationChannelAnalyticsUseCase, {
    lifetime: Lifetime.TRANSIENT,
  }),
  getCalendarEventsUseCase: asClass(GetCalendarEventsUseCase, { lifetime: Lifetime.TRANSIENT }),
  sendWeeklyDigestUseCase: asClass(SendWeeklyDigestUseCase, { lifetime: Lifetime.TRANSIENT }),
} satisfies NameAndRegistrationPair<Cradle>;
