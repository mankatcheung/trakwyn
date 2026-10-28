/**
 * Step-up for accounts with no password (JEF-463): a mailed code, or a fresh
 * sign-in with a provider that can prove one. The password route is
 * `reauthenticate`/`reauthenticateMobile`. Every field here needs a session
 * (`sid`), because what it refreshes is that session's `authTime`; an API
 * token has none and is refused.
 */

import { GraphQLError } from 'graphql';
import { builder } from '#src/http/schema/builder.js';
import { setAuthCookies } from '#src/http/schema/types/AuthPayloadType.js';
import { MobileAuthPayloadRef } from '#src/http/schema/types/MobileAuthPayloadType.js';
import { OAuthProviderEnum } from '#src/http/schema/types/enums/OAuthProviderEnum.js';
import type { GraphQLContext } from '#src/http/context.js';
import { fromCodedError } from '#src/http/errors/AppError.js';
import { ERROR_CODES } from '#src/use-cases/errors/errorCodes.js';

function requireSession(ctx: GraphQLContext): { userId: string; sessionId: string } {
  if (!ctx.user || !ctx.user.sid) {
    throw new GraphQLError('Unauthorized', { extensions: { code: ERROR_CODES.UNAUTHORIZED } });
  }
  return { userId: ctx.user.sub, sessionId: ctx.user.sid };
}

builder.mutationField('requestStepUpCode', (t) =>
  t.boolean({
    description: 'Mails a 6-digit code to an account with no password, for `verifyStepUpCode`.',
    resolve: async (_root, _args, ctx) => {
      const { userId } = requireSession(ctx);
      try {
        await ctx.diScope.cradle.authResolver.requestStepUpCode(userId);
        return true;
      } catch (err) {
        throw fromCodedError(err);
      }
    },
  }),
);

builder.mutationField('verifyStepUpCode', (t) =>
  t.boolean({
    description: 'Checks a mailed step-up code and refreshes the session cookies.',
    args: { code: t.arg.string({ required: true }) },
    resolve: async (_root, args, ctx) => {
      const { userId, sessionId } = requireSession(ctx);
      try {
        const tokens = await ctx.diScope.cradle.authResolver.verifyStepUpCode(
          userId,
          sessionId,
          args.code,
        );
        setAuthCookies(ctx.reply, tokens.accessToken, tokens.refreshToken);
        return true;
      } catch (err) {
        throw fromCodedError(err);
      }
    },
  }),
);

builder.mutationField('verifyStepUpCodeMobile', (t) =>
  t.field({
    type: MobileAuthPayloadRef,
    description: '`verifyStepUpCode` for clients with no cookie jar: the tokens come in the body.',
    args: { code: t.arg.string({ required: true }) },
    resolve: async (_root, args, ctx) => {
      const { userId, sessionId } = requireSession(ctx);
      try {
        return await ctx.diScope.cradle.authResolver.verifyStepUpCode(userId, sessionId, args.code);
      } catch (err) {
        throw fromCodedError(err);
      }
    },
  }),
);

builder.mutationField('startOAuthReauth', (t) =>
  t.string({
    description:
      'A short-lived ticket for `/auth/oauth/:provider/start?mode=reauth&ticket=…`, which refreshes this session once the provider signs the user in again.',
    args: { provider: t.arg({ type: OAuthProviderEnum, required: true }) },
    resolve: (_root, args, ctx) => {
      const { userId, sessionId } = requireSession(ctx);
      const { oauthProviderRegistry, oauthStateService } = ctx.diScope.cradle;
      // Refused up front for a provider that could never pass the callback's
      // check, rather than after a round trip through its consent screen.
      if (!oauthProviderRegistry.get(args.provider).supportsReauth) {
        throw new GraphQLError('This sign-in method cannot confirm your identity', {
          extensions: { code: ERROR_CODES.FORBIDDEN },
        });
      }
      return oauthStateService.issueReauthTicket(userId, sessionId);
    },
  }),
);
