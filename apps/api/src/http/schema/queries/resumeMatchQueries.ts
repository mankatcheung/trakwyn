import { GraphQLError } from 'graphql';
import { builder } from '#src/http/schema/builder.js';
import { ResumeMatchRef } from '#src/http/schema/types/ResumeMatchScoreType.js';
import { fromCodedError } from '#src/http/errors/AppError.js';
import { ERROR_CODES } from '#src/use-cases/errors/errorCodes.js';

builder.queryField('resumeMatches', (t) =>
  t.field({
    type: [ResumeMatchRef],
    args: {
      applicationId: t.arg.id({ required: true }),
    },
    resolve: async (_root, args, ctx) => {
      if (!ctx.user)
        throw new GraphQLError('Unauthorized', { extensions: { code: ERROR_CODES.UNAUTHORIZED } });
      const { getResumeMatchesUseCase } = ctx.diScope.cradle;
      try {
        return await getResumeMatchesUseCase.execute({
          userId: ctx.user.sub,
          applicationId: String(args.applicationId),
        });
      } catch (err) {
        throw fromCodedError(err);
      }
    },
  }),
);
