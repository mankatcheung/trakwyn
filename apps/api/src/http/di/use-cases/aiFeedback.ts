import { asClass, Lifetime, type NameAndRegistrationPair } from 'awilix';

import { RateAiOutputUseCase } from '#src/use-cases/aiFeedback/RateAiOutputUseCase.js';
import { GetAiOutputRatingsUseCase } from '#src/use-cases/aiFeedback/GetAiOutputRatingsUseCase.js';
import { ClearAiOutputRatingUseCase } from '#src/use-cases/aiFeedback/ClearAiOutputRatingUseCase.js';

import type { Cradle } from '../types.js';

export const aiFeedback = {
  rateAiOutputUseCase: asClass(RateAiOutputUseCase, { lifetime: Lifetime.TRANSIENT }),
  getAiOutputRatingsUseCase: asClass(GetAiOutputRatingsUseCase, { lifetime: Lifetime.TRANSIENT }),
  clearAiOutputRatingUseCase: asClass(ClearAiOutputRatingUseCase, {
    lifetime: Lifetime.TRANSIENT,
  }),
} satisfies NameAndRegistrationPair<Cradle>;
