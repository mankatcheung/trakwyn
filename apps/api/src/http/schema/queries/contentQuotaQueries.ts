import { GraphQLError } from 'graphql';
import { builder } from '#src/http/schema/builder.js';
import { ContentQuotaRef } from '#src/http/schema/types/ContentQuotaType.js';
import { ERROR_CODES } from '#src/use-cases/errors/errorCodes.js';

builder.queryField('contentQuota', (t) =>
  t.field({
    type: ContentQuotaRef,
    description:
      'The limits on what the signed-in user can add, and how much of each per-user limit they have used (JEF-339).',
    resolve: async (_root, _args, ctx) => {
      if (!ctx.user)
        throw new GraphQLError('Unauthorized', { extensions: { code: ERROR_CODES.UNAUTHORIZED } });
      return ctx.diScope.cradle.getContentQuotaUseCase.execute({ userId: ctx.user.sub });
    },
  }),
);
