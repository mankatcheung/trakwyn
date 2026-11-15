import { GraphQLError } from 'graphql';
import { builder } from '#src/http/schema/builder.js';
import { PostingRequirementsRef } from '#src/http/schema/types/PostingRequirementsType.js';
import { fromCodedError } from '#src/http/errors/AppError.js';
import { ERROR_CODES } from '#src/use-cases/errors/errorCodes.js';

builder.mutationField('extractPostingRequirements', (t) =>
  t.field({
    type: PostingRequirementsRef,
    description:
      'Read what an application’s posting asks for, with AI, and save it. Returns the saved list without a call when the posting has not changed.',
    args: {
      applicationId: t.arg.id({ required: true }),
    },
    resolve: async (_root, args, ctx) => {
      if (!ctx.user)
        throw new GraphQLError('Unauthorized', { extensions: { code: ERROR_CODES.UNAUTHORIZED } });
      const { extractPostingRequirementsUseCase } = ctx.diScope.cradle;
      try {
        return await extractPostingRequirementsUseCase.execute({
          userId: ctx.user.sub,
          applicationId: String(args.applicationId),
        });
      } catch (err) {
        throw fromCodedError(err);
      }
    },
  }),
);
