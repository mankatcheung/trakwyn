import { asClass, Lifetime, type NameAndRegistrationPair } from 'awilix';

import { CreateOfferUseCase } from '#src/use-cases/offers/CreateOfferUseCase.js';
import { UpdateOfferUseCase } from '#src/use-cases/offers/UpdateOfferUseCase.js';
import { DeleteOfferUseCase } from '#src/use-cases/offers/DeleteOfferUseCase.js';
import { GetOffersUseCase } from '#src/use-cases/offers/GetOffersUseCase.js';
import { GetAllOffersUseCase } from '#src/use-cases/offers/GetAllOffersUseCase.js';
import { CompareOffersUseCase } from '#src/use-cases/offers/CompareOffersUseCase.js';
import { GetOfferAnalyticsUseCase } from '#src/use-cases/offers/GetOfferAnalyticsUseCase.js';

import type { Cradle } from '../types.js';

export const offers = {
  createOfferUseCase: asClass(CreateOfferUseCase, { lifetime: Lifetime.TRANSIENT }),
  updateOfferUseCase: asClass(UpdateOfferUseCase, { lifetime: Lifetime.TRANSIENT }),
  deleteOfferUseCase: asClass(DeleteOfferUseCase, { lifetime: Lifetime.TRANSIENT }),
  getOffersUseCase: asClass(GetOffersUseCase, { lifetime: Lifetime.TRANSIENT }),
  getAllOffersUseCase: asClass(GetAllOffersUseCase, { lifetime: Lifetime.TRANSIENT }),
  compareOffersUseCase: asClass(CompareOffersUseCase, { lifetime: Lifetime.TRANSIENT }),
  getOfferAnalyticsUseCase: asClass(GetOfferAnalyticsUseCase, { lifetime: Lifetime.TRANSIENT }),
} satisfies NameAndRegistrationPair<Cradle>;
