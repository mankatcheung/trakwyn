/**
 * Credentials and account lifecycle.
 *
 * One of the per-concern modules split out of the former 498-line
 * `userMutations.ts` (JEF-255); `userMutations.ts` still registers them all.
 */

import { ERROR_CODES } from '#src/use-cases/errors/errorCodes.js';
import { GraphQLError } from 'graphql';
import { builder } from '#src/http/schema/builder.js';
import { deviceInfoFrom } from '#src/http/schema/requestDeviceInfo.js';
import { fromCodedError } from '#src/http/errors/AppError.js';
import { sessionAuthTime } from '#src/http/schema/mutations/user/sessionAuthTime.js';

builder.mutationField('updatePassword', (t) =>
  t.boolean({
    args: {
      currentPassword: t.arg.string({ required: true }),
      newPassword: t.arg.string({ required: true }),
    },
    resolve: async (_root, args, ctx) => {
      if (!ctx.user)
        throw new GraphQLError('Unauthorized', { extensions: { code: ERROR_CODES.UNAUTHORIZED } });
      const { userResolver } = ctx.diScope.cradle;
      try {
        await userResolver.updatePassword(
          ctx.user.sub,
          args.currentPassword,
          args.newPassword,
          sessionAuthTime(ctx.user),
          deviceInfoFrom(ctx.request),
        );
        return true;
      } catch (err) {
        throw fromCodedError(err);
      }
    },
  }),
);
