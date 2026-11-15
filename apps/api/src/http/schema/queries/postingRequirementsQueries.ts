import { GraphQLError } from 'graphql';
import { builder } from '#src/http/schema/builder.js';
import { PostingRequirementsRef } from '#src/http/schema/types/PostingRequirementsType.js';
import { fromCodedError } from '#src/http/errors/AppError.js';
import { ERROR_CODES } from '#src/use-cases/errors/errorCodes.js';

builder.queryField('postingRequirements', (t) =>
  t.field({
    type: PostingRequirementsRef,
    nullable: true,
    description:
      'The saved requirements for an application’s posting, or null when it has not been read. Never calls AI.',
    args: {
      applicationId: t.arg.id({ required: true }),
    },
    resolve: async (_root, args, ctx) => {
      if (!ctx.user)
        throw new GraphQLError('Unauthorized', { extensions: { code: ERROR_CODES.UNAUTHORIZED } });
      const { getPostingRequirementsUseCase } = ctx.diScope.cradle;
      try {
        return await getPostingRequirementsUseCase.execute({
          userId: ctx.user.sub,
          applicationId: String(args.applicationId),
        });
      } catch (err) {
        throw fromCodedError(err);
      }
    },
  }),
);
