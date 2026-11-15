import { builder } from '#src/http/schema/builder.js';
import type { ImportCvProfileOutput } from '#src/use-cases/profile/IImportCvProfileUseCase.js';

export const ImportCvProfileResultRef =
  builder.objectRef<ImportCvProfileOutput>('ImportCvProfileResult');
ImportCvProfileResultRef.implement({
  fields: (t) => ({
    workExperiences: t.exposeInt('workExperiences'),
    educations: t.exposeInt('educations'),
    skills: t.exposeInt('skills'),
    certifications: t.exposeInt('certifications'),
    languages: t.exposeInt('languages'),
    projects: t.exposeInt('projects'),
    awards: t.exposeInt('awards'),
    filledContact: t.exposeStringList('filledContact'),
  }),
});
