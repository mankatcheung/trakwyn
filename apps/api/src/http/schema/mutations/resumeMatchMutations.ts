import { GraphQLError } from 'graphql';
import { builder } from '#src/http/schema/builder.js';
import { ResumeMatchRef } from '#src/http/schema/types/ResumeMatchScoreType.js';
import { fromCodedError } from '#src/http/errors/AppError.js';
import { ERROR_CODES } from '#src/use-cases/errors/errorCodes.js';

builder.mutationField('computeResumeMatchScore', (t) =>
  t.field({
    type: ResumeMatchRef,
    args: {
      applicationId: t.arg.id({ required: true }),
      // Exactly one: the draft or the uploaded file being scored.
      documentDraftId: t.arg.id({ required: false }),
      documentId: t.arg.id({ required: false }),
    },
    resolve: async (_root, args, ctx) => {
      if (!ctx.user)
        throw new GraphQLError('Unauthorized', { extensions: { code: ERROR_CODES.UNAUTHORIZED } });
      const { computeResumeMatchScoreUseCase } = ctx.diScope.cradle;
      try {
        return await computeResumeMatchScoreUseCase.execute({
          applicationId: String(args.applicationId),
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
