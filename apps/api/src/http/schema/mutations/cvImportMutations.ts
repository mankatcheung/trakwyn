import { GraphQLError } from 'graphql';
import { builder } from '#src/http/schema/builder.js';
import { ImportCvProfileResultRef } from '#src/http/schema/types/ImportCvProfileResultType.js';
import { ImportCvProfileInput } from '#src/http/schema/types/inputs/CvImportInputs.js';
import { fromCodedError } from '#src/http/errors/AppError.js';
import { ERROR_CODES } from '#src/use-cases/errors/errorCodes.js';

/**
 * The confirm half of the CV import (JEF-461). Reading the file is the REST
 * route `POST /profile/cv-import`; this takes back the entries the user
 * ticked in the review step and creates them in one transaction.
 */
builder.mutationField('importCvProfile', (t) =>
  t.field({
    type: ImportCvProfileResultRef,
    args: {
      input: t.arg({ type: ImportCvProfileInput, required: true }),
    },
    resolve: async (_root, args, ctx) => {
      if (!ctx.user)
        throw new GraphQLError('Unauthorized', { extensions: { code: ERROR_CODES.UNAUTHORIZED } });
      const { importCvProfileUseCase } = ctx.diScope.cradle;
      try {
        return await importCvProfileUseCase.execute({
          userId: ctx.user.sub,
          workExperiences: args.input.workExperiences.map((entry) => ({
            company: entry.company,
            title: entry.title,
            location: entry.location,
            startDate: new Date(entry.startDate),
            endDate: entry.endDate ? new Date(entry.endDate) : null,
            description: entry.description,
          })),
          educations: args.input.educations.map((entry) => ({
            institution: entry.institution,
            degree: entry.degree,
            field: entry.field,
            startDate: new Date(entry.startDate),
            endDate: entry.endDate ? new Date(entry.endDate) : null,
            description: entry.description,
          })),
          skills: args.input.skills.map((entry) => ({
            name: entry.name,
            category: entry.category,
            proficiency: entry.proficiency,
          })),
        });
      } catch (err) {
        throw fromCodedError(err);
      }
    },
  }),
);
