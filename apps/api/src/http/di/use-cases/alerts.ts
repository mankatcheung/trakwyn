import { asClass, Lifetime, type NameAndRegistrationPair } from 'awilix';

import { FileAlertIssueUseCase } from '#src/use-cases/alerts/FileAlertIssueUseCase.js';

import type { Cradle } from '../types.js';

export const alerts = {
  fileAlertIssueUseCase: asClass(FileAlertIssueUseCase, { lifetime: Lifetime.TRANSIENT }),
} satisfies NameAndRegistrationPair<Cradle>;
