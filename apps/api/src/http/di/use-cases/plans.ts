import { asClass, Lifetime, type NameAndRegistrationPair } from 'awilix';

import { GetBillingStatusUseCase } from '#src/use-cases/plans/GetBillingStatusUseCase.js';
import { GetContentQuotaUseCase } from '#src/use-cases/quotas/GetContentQuotaUseCase.js';

import type { Cradle } from '../types.js';

export const plans = {
  getBillingStatusUseCase: asClass(GetBillingStatusUseCase, { lifetime: Lifetime.TRANSIENT }),
  getContentQuotaUseCase: asClass(GetContentQuotaUseCase, { lifetime: Lifetime.TRANSIENT }),
} satisfies NameAndRegistrationPair<Cradle>;
