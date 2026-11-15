import { GraphQLError } from 'graphql';
import { builder } from '#src/http/schema/builder.js';
import { LanguageRef } from '#src/http/schema/types/LanguageType.js';
import { ERROR_CODES } from '#src/use-cases/errors/errorCodes.js';

builder.queryField('languages', (t) =>
  t.field({
    type: [LanguageRef],
    resolve: async (_root, _args, ctx) => {
      if (!ctx.user)
        throw new GraphQLError('Unauthorized', { extensions: { code: ERROR_CODES.UNAUTHORIZED } });
      const { languageResolver } = ctx.diScope.cradle;
      return languageResolver.getLanguages(ctx.user.sub);
    },
  }),
);
