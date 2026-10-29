/**
 * Changing the account email, and the backup email used to recover it.
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

builder.mutationField('requestEmailChange', (t) =>
  t.boolean({
    args: {
      currentPassword: t.arg.string(),
      newEmail: t.arg.string({ required: true }),
    },
    resolve: async (_root, args, ctx) => {
      if (!ctx.user)
        throw new GraphQLError('Unauthorized', { extensions: { code: ERROR_CODES.UNAUTHORIZED } });
      const { userResolver } = ctx.diScope.cradle;
      try {
        await userResolver.requestEmailChange(
          ctx.user.sub,
          args.currentPassword,
          args.newEmail,
          sessionAuthTime(ctx.user),
        );
        return true;
      } catch (err) {
        throw fromCodedError(err);
      }
    },
  }),
);

builder.mutationField('confirmEmailChange', (t) =>
  t.boolean({
    args: {
      token: t.arg.string({ required: true }),
    },
    resolve: async (_root, args, ctx) => {
      const { userResolver } = ctx.diScope.cradle;
      try {
        await userResolver.confirmEmailChange(args.token, deviceInfoFrom(ctx.request));
        return true;
      } catch (err) {
        throw fromCodedError(err);
      }
    },
  }),
);

builder.mutationField('requestAddBackupEmail', (t) =>
  t.boolean({
    args: {
      currentPassword: t.arg.string(),
      backupEmail: t.arg.string({ required: true }),
    },
    resolve: async (_root, args, ctx) => {
      if (!ctx.user)
        throw new GraphQLError('Unauthorized', { extensions: { code: ERROR_CODES.UNAUTHORIZED } });
      const { userResolver } = ctx.diScope.cradle;
      try {
        await userResolver.requestAddBackupEmail(
          ctx.user.sub,
          args.backupEmail,
          args.currentPassword,
          sessionAuthTime(ctx.user),
        );
        return true;
      } catch (err) {
        throw fromCodedError(err);
      }
    },
  }),
);

builder.mutationField('confirmBackupEmail', (t) =>
  t.boolean({
    args: {
      token: t.arg.string({ required: true }),
    },
    resolve: async (_root, args, ctx) => {
      const { userResolver } = ctx.diScope.cradle;
      try {
        await userResolver.confirmBackupEmail(args.token);
        return true;
      } catch (err) {
        throw fromCodedError(err);
      }
    },
  }),
);

builder.mutationField('removeBackupEmail', (t) =>
  t.boolean({
    args: {
      currentPassword: t.arg.string(),
    },
    resolve: async (_root, args, ctx) => {
      if (!ctx.user)
        throw new GraphQLError('Unauthorized', { extensions: { code: ERROR_CODES.UNAUTHORIZED } });
      const { userResolver } = ctx.diScope.cradle;
      try {
        await userResolver.removeBackupEmail(
          ctx.user.sub,
          args.currentPassword,
          sessionAuthTime(ctx.user),
        );
        return true;
      } catch (err) {
        throw fromCodedError(err);
      }
    },
  }),
);
