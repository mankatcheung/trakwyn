/**
 * Deleting an account (JEF-463): request (mails a link), confirm (the link;
 * schedules the deletion after a grace period), cancel (from the app or the
 * mailed link). The purge itself is `/admin/accounts/purge`.
 */

import { GraphQLError } from 'graphql';
import { builder } from '#src/http/schema/builder.js';
import { clearAuthCookies } from '#src/http/schema/types/AuthPayloadType.js';
import type { GraphQLContext } from '#src/http/context.js';
import { fromCodedError } from '#src/http/errors/AppError.js';
import { sessionAuthTime } from '#src/http/schema/mutations/user/sessionAuthTime.js';
import { ERROR_CODES } from '#src/use-cases/errors/errorCodes.js';

const unauthorized = () =>
  new GraphQLError('Unauthorized', { extensions: { code: ERROR_CODES.UNAUTHORIZED } });

/** A session, not an API token: deletion needs a person who can step up. */
function sessionUser(ctx: GraphQLContext) {
  if (!ctx.user || !ctx.user.sid) throw unauthorized();
  return ctx.user;
}

builder.mutationField('requestAccountDeletion', (t) =>
  t.boolean({
    description:
      'Mails a link that schedules this account for deletion. Needs a fresh session (STEP_UP_REQUIRED otherwise).',
    resolve: async (_root, _args, ctx) => {
      const user = sessionUser(ctx);
      try {
        await ctx.diScope.cradle.userResolver.requestAccountDeletion({
          userId: user.sub,
          authTime: sessionAuthTime(user),
        });
        return true;
      } catch (err) {
        throw fromCodedError(err);
      }
    },
  }),
);

builder.mutationField('deleteAccount', (t) =>
  t.boolean({
    deprecationReason:
      'Use requestAccountDeletion. Kept for shipped app versions (JEF-417): it now mails the confirmation link and deletes nothing itself.',
    args: { password: t.arg.string({ required: true }) },
    resolve: async (_root, args, ctx) => {
      const user = sessionUser(ctx);
      try {
        await ctx.diScope.cradle.userResolver.requestAccountDeletion({
          userId: user.sub,
          authTime: sessionAuthTime(user),
          legacyPassword: args.password,
        });
        return true;
      } catch (err) {
        throw fromCodedError(err);
      }
    },
  }),
);

builder.mutationField('confirmAccountDeletion', (t) =>
  t.string({
    description:
      'The mailed link: schedules the deletion and returns its date (ISO 8601). Needs no session; ends every session, so the cookies are cleared.',
    args: { token: t.arg.string({ required: true }) },
    resolve: async (_root, args, ctx) => {
      try {
        const date = await ctx.diScope.cradle.userResolver.confirmAccountDeletion(args.token);
        clearAuthCookies(ctx.reply);
        return date.toISOString();
      } catch (err) {
        throw fromCodedError(err);
      }
    },
  }),
);

builder.mutationField('cancelAccountDeletion', (t) =>
  t.boolean({
    description:
      'Cancels the signed-in account’s scheduled deletion. Without a session, pass the token from the mailed link instead.',
    args: { token: t.arg.string() },
    resolve: async (_root, args, ctx) => {
      if (!args.token && !ctx.user) throw unauthorized();
      try {
        await ctx.diScope.cradle.userResolver.cancelAccountDeletion(
          args.token ? { token: args.token } : { userId: ctx.user!.sub },
        );
        return true;
      } catch (err) {
        throw fromCodedError(err);
      }
    },
  }),
);
