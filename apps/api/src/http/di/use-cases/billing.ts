import { asClass, Lifetime, type NameAndRegistrationPair } from 'awilix';

import { CreateBillingPortalSessionUseCase } from '#src/use-cases/billing/CreateBillingPortalSessionUseCase.js';
import { CreateCheckoutSessionUseCase } from '#src/use-cases/billing/CreateCheckoutSessionUseCase.js';
import { HandleBillingWebhookUseCase } from '#src/use-cases/billing/HandleBillingWebhookUseCase.js';

import type { Cradle } from '../types.js';

export const billing = {
  createCheckoutSessionUseCase: asClass(CreateCheckoutSessionUseCase, {
    lifetime: Lifetime.TRANSIENT,
  }),
  createBillingPortalSessionUseCase: asClass(CreateBillingPortalSessionUseCase, {
    lifetime: Lifetime.TRANSIENT,
  }),
  handleBillingWebhookUseCase: asClass(HandleBillingWebhookUseCase, {
    lifetime: Lifetime.TRANSIENT,
  }),
} satisfies NameAndRegistrationPair<Cradle>;
