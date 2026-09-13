import { GraphQLError } from 'graphql';
import { builder } from '#src/http/schema/builder.js';
import { CalendarConnectionRef } from '#src/http/schema/types/CalendarConnectionType.js';
import { ERROR_CODES } from '#src/use-cases/errors/errorCodes.js';

builder.queryField('calendarConnections', (t) =>
  t.field({
    type: [CalendarConnectionRef],
    resolve: async (_root, _args, ctx) => {
      if (!ctx.user)
        throw new GraphQLError('Unauthorized', { extensions: { code: ERROR_CODES.UNAUTHORIZED } });
      const { calendarResolver } = ctx.diScope.cradle;
      return calendarResolver.listConnections(ctx.user.sub);
    },
  }),
);
