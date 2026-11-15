import { asClass, Lifetime, type NameAndRegistrationPair } from 'awilix';

import { ParseCvUseCase } from '#src/use-cases/profile/ParseCvUseCase.js';
import { ImportCvProfileUseCase } from '#src/use-cases/profile/ImportCvProfileUseCase.js';
import { CreateWorkExperienceUseCase } from '#src/use-cases/workExperience/CreateWorkExperienceUseCase.js';
import { UpdateWorkExperienceUseCase } from '#src/use-cases/workExperience/UpdateWorkExperienceUseCase.js';
import { DeleteWorkExperienceUseCase } from '#src/use-cases/workExperience/DeleteWorkExperienceUseCase.js';
import { CreateEducationUseCase } from '#src/use-cases/education/CreateEducationUseCase.js';
import { UpdateEducationUseCase } from '#src/use-cases/education/UpdateEducationUseCase.js';
import { DeleteEducationUseCase } from '#src/use-cases/education/DeleteEducationUseCase.js';
import { CreateCertificationUseCase } from '#src/use-cases/certification/CreateCertificationUseCase.js';
import { UpdateCertificationUseCase } from '#src/use-cases/certification/UpdateCertificationUseCase.js';
import { DeleteCertificationUseCase } from '#src/use-cases/certification/DeleteCertificationUseCase.js';
import { CreateLanguageUseCase } from '#src/use-cases/language/CreateLanguageUseCase.js';
import { UpdateLanguageUseCase } from '#src/use-cases/language/UpdateLanguageUseCase.js';
import { DeleteLanguageUseCase } from '#src/use-cases/language/DeleteLanguageUseCase.js';
import { CreateSkillUseCase } from '#src/use-cases/skill/CreateSkillUseCase.js';
import { UpdateSkillUseCase } from '#src/use-cases/skill/UpdateSkillUseCase.js';
import { DeleteSkillUseCase } from '#src/use-cases/skill/DeleteSkillUseCase.js';

import type { Cradle } from '../types.js';

export const profile = {
  parseCvUseCase: asClass(ParseCvUseCase, { lifetime: Lifetime.TRANSIENT }),
  importCvProfileUseCase: asClass(ImportCvProfileUseCase, { lifetime: Lifetime.TRANSIENT }),
  createWorkExperienceUseCase: asClass(CreateWorkExperienceUseCase, {
    lifetime: Lifetime.TRANSIENT,
  }),
  updateWorkExperienceUseCase: asClass(UpdateWorkExperienceUseCase, {
    lifetime: Lifetime.TRANSIENT,
  }),
  deleteWorkExperienceUseCase: asClass(DeleteWorkExperienceUseCase, {
    lifetime: Lifetime.TRANSIENT,
  }),
  createEducationUseCase: asClass(CreateEducationUseCase, { lifetime: Lifetime.TRANSIENT }),
  updateEducationUseCase: asClass(UpdateEducationUseCase, { lifetime: Lifetime.TRANSIENT }),
  deleteEducationUseCase: asClass(DeleteEducationUseCase, { lifetime: Lifetime.TRANSIENT }),
  createSkillUseCase: asClass(CreateSkillUseCase, { lifetime: Lifetime.TRANSIENT }),
  updateSkillUseCase: asClass(UpdateSkillUseCase, { lifetime: Lifetime.TRANSIENT }),
  deleteSkillUseCase: asClass(DeleteSkillUseCase, { lifetime: Lifetime.TRANSIENT }),
  createCertificationUseCase: asClass(CreateCertificationUseCase, { lifetime: Lifetime.TRANSIENT }),
  updateCertificationUseCase: asClass(UpdateCertificationUseCase, { lifetime: Lifetime.TRANSIENT }),
  deleteCertificationUseCase: asClass(DeleteCertificationUseCase, { lifetime: Lifetime.TRANSIENT }),
  createLanguageUseCase: asClass(CreateLanguageUseCase, { lifetime: Lifetime.TRANSIENT }),
  updateLanguageUseCase: asClass(UpdateLanguageUseCase, { lifetime: Lifetime.TRANSIENT }),
  deleteLanguageUseCase: asClass(DeleteLanguageUseCase, { lifetime: Lifetime.TRANSIENT }),
} satisfies NameAndRegistrationPair<Cradle>;
