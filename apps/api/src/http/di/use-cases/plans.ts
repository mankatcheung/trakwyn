import { asClass, Lifetime, type NameAndRegistrationPair } from 'awilix';

import { GetBillingStatusUseCase } from '#src/use-cases/plans/GetBillingStatusUseCase.js';

import type { Cradle } from '../types.js';

export const plans = {
  getBillingStatusUseCase: asClass(GetBillingStatusUseCase, { lifetime: Lifetime.TRANSIENT }),
} satisfies NameAndRegistrationPair<Cradle>;
