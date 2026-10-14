import { GraphQLError } from 'graphql';
import { builder } from '#src/http/schema/builder.js';
import { AtsScoreRef } from '#src/http/schema/types/AtsScoreType.js';
import { fromCodedError } from '#src/http/errors/AppError.js';
import { ERROR_CODES } from '#src/use-cases/errors/errorCodes.js';

builder.queryField('resumeAtsScores', (t) =>
  t.field({
    type: [AtsScoreRef],
    args: {
      applicationId: t.arg.id({ required: true }),
    },
    resolve: async (_root, args, ctx) => {
      if (!ctx.user)
        throw new GraphQLError('Unauthorized', { extensions: { code: ERROR_CODES.UNAUTHORIZED } });
      const { getResumeAtsScoresUseCase } = ctx.diScope.cradle;
      try {
        return await getResumeAtsScoresUseCase.execute({
          userId: ctx.user.sub,
          applicationId: String(args.applicationId),
        });
      } catch (err) {
        throw fromCodedError(err);
      }
    },
  }),
);
