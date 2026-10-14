import { GraphQLError } from 'graphql';
import { builder } from '#src/http/schema/builder.js';
import { AtsScoreRef } from '#src/http/schema/types/AtsScoreType.js';
import { fromCodedError } from '#src/http/errors/AppError.js';
import { ERROR_CODES } from '#src/use-cases/errors/errorCodes.js';

builder.mutationField('computeResumeAtsScore', (t) =>
  t.field({
    type: AtsScoreRef,
    args: {
      // Exactly one: the draft or the uploaded file being scored.
      documentDraftId: t.arg.id({ required: false }),
      documentId: t.arg.id({ required: false }),
    },
    resolve: async (_root, args, ctx) => {
      if (!ctx.user)
        throw new GraphQLError('Unauthorized', { extensions: { code: ERROR_CODES.UNAUTHORIZED } });
      const { computeResumeAtsScoreUseCase } = ctx.diScope.cradle;
      try {
        return await computeResumeAtsScoreUseCase.execute({
          userId: ctx.user.sub,
          documentDraftId: args.documentDraftId ? String(args.documentDraftId) : null,
          documentId: args.documentId ? String(args.documentId) : null,
        });
      } catch (err) {
        throw fromCodedError(err);
      }
    },
  }),
);
