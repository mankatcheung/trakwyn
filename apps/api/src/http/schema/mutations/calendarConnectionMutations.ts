import { GraphQLError } from 'graphql';
import { builder } from '#src/http/schema/builder.js';
import { CalendarProviderEnum } from '#src/http/schema/types/enums/CalendarProviderEnum.js';
import { fromCodedError } from '#src/http/errors/AppError.js';
import { ERROR_CODES } from '#src/use-cases/errors/errorCodes.js';

builder.mutationField('disconnectCalendar', (t) =>
  t.boolean({
    args: {
      provider: t.arg({ type: CalendarProviderEnum, required: true }),
    },
    resolve: async (_root, args, ctx) => {
      if (!ctx.user)
        throw new GraphQLError('Unauthorized', { extensions: { code: ERROR_CODES.UNAUTHORIZED } });
      const { calendarResolver } = ctx.diScope.cradle;
      try {
        return await calendarResolver.disconnect(ctx.user.sub, args.provider);
      } catch (err) {
        throw fromCodedError(err);
      }
    },
  }),
);
