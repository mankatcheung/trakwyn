import { asClass, Lifetime, type NameAndRegistrationPair } from 'awilix';
import { CreateDraftVersionUseCase } from '#src/use-cases/documents/CreateDraftVersionUseCase.js';
import { ListDraftVersionsUseCase } from '#src/use-cases/documents/ListDraftVersionsUseCase.js';
import { GetDraftVersionUseCase } from '#src/use-cases/documents/GetDraftVersionUseCase.js';
import { RestoreDraftVersionUseCase } from '#src/use-cases/documents/RestoreDraftVersionUseCase.js';

import type { Cradle } from '../types.js';

/** Draft history (JEF-584). */
export const draftHistory = {
  createDraftVersionUseCase: asClass(CreateDraftVersionUseCase, { lifetime: Lifetime.TRANSIENT }),
  listDraftVersionsUseCase: asClass(ListDraftVersionsUseCase, { lifetime: Lifetime.TRANSIENT }),
  getDraftVersionUseCase: asClass(GetDraftVersionUseCase, { lifetime: Lifetime.TRANSIENT }),
  restoreDraftVersionUseCase: asClass(RestoreDraftVersionUseCase, {
    lifetime: Lifetime.TRANSIENT,
  }),
} satisfies NameAndRegistrationPair<Cradle>;
