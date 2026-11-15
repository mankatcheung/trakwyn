import { GraphQLError } from 'graphql';
import { builder } from '#src/http/schema/builder.js';
import { AwardRef } from '#src/http/schema/types/AwardType.js';
import { ERROR_CODES } from '#src/use-cases/errors/errorCodes.js';

builder.queryField('awards', (t) =>
  t.field({
    type: [AwardRef],
    resolve: async (_root, _args, ctx) => {
      if (!ctx.user)
        throw new GraphQLError('Unauthorized', { extensions: { code: ERROR_CODES.UNAUTHORIZED } });
      const { awardResolver } = ctx.diScope.cradle;
      return awardResolver.getAwards(ctx.user.sub);
    },
  }),
);
