import { GraphQLError } from 'graphql';
import { builder } from '#src/http/schema/builder.js';
import { ResumeGapsRef } from '#src/http/schema/types/ResumeGapsType.js';
import { fromCodedError } from '#src/http/errors/AppError.js';
import { ERROR_CODES } from '#src/use-cases/errors/errorCodes.js';

builder.queryField('resumeGaps', (t) =>
  t.field({
    type: ResumeGapsRef,
    description: 'What would strengthen a resume for this application. Never calls AI.',
    args: {
      applicationId: t.arg.id({ required: true }),
    },
    resolve: async (_root, args, ctx) => {
      if (!ctx.user)
        throw new GraphQLError('Unauthorized', { extensions: { code: ERROR_CODES.UNAUTHORIZED } });
      const { getResumeGapsUseCase } = ctx.diScope.cradle;
      try {
        return await getResumeGapsUseCase.execute({
          userId: ctx.user.sub,
          applicationId: String(args.applicationId),
        });
      } catch (err) {
        throw fromCodedError(err);
      }
    },
  }),
);
