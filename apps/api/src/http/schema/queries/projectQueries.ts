import { GraphQLError } from 'graphql';
import { builder } from '#src/http/schema/builder.js';
import { ProjectRef } from '#src/http/schema/types/ProjectType.js';
import { ERROR_CODES } from '#src/use-cases/errors/errorCodes.js';

builder.queryField('projects', (t) =>
  t.field({
    type: [ProjectRef],
    resolve: async (_root, _args, ctx) => {
      if (!ctx.user)
        throw new GraphQLError('Unauthorized', { extensions: { code: ERROR_CODES.UNAUTHORIZED } });
      const { projectResolver } = ctx.diScope.cradle;
      return projectResolver.getProjects(ctx.user.sub);
    },
  }),
);
