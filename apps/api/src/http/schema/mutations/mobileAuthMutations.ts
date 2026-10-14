import { GraphQLError } from 'graphql';
import { builder } from '#src/http/schema/builder.js';
import {
  MobileAuthPayloadRef,
  MobileLoginResultRef,
} from '#src/http/schema/types/MobileAuthPayloadType.js';
import { deviceInfoFrom } from '#src/http/schema/requestDeviceInfo.js';
import { fromCodedError } from '#src/http/errors/AppError.js';
import { ERROR_CODES } from '#src/use-cases/errors/errorCodes.js';

/**
 * Mobile counterparts of authMutations.ts. React Native has no cookie jar
 * tied to the API's domain, so these return both the access and refresh
 * token in the response body instead of setting HttpOnly cookies. Session
 * creation, rotation, revocation and the blocklist are all unchanged — this
 * is purely a transport difference at the GraphQL layer, and `logout` is
 * shared as-is (it only needs the Authorization header, already supported by
 * buildGraphQLContext's Bearer fallback).
 */

builder.mutationField('registerMobile', (t) =>
  t.field({
    type: MobileAuthPayloadRef,
    args: {
      email: t.arg.string({ required: true }),
      password: t.arg.string({ required: true }),
    },
    resolve: async (_root, args, ctx) => {
      const { authResolver } = ctx.diScope.cradle;
      return authResolver.register(args.email, args.password, deviceInfoFrom(ctx.request), {
        enforce: false,
      });
    },
  }),
);

builder.mutationField('loginMobile', (t) =>
  t.field({
    type: MobileLoginResultRef,
    args: {
      email: t.arg.string({ required: true }),
      password: t.arg.string({ required: true }),
    },
    resolve: async (_root, args, ctx) => {
      const { authResolver } = ctx.diScope.cradle;
      const result = await authResolver.login(
        args.email,
        args.password,
        deviceInfoFrom(ctx.request),
        { enforce: false },
      );
      return {
        success: !result.totpRequired,
        totpRequired: result.totpRequired,
        accessToken: result.tokens?.accessToken ?? null,
        refreshToken: result.tokens?.refreshToken ?? null,
      };
    },
  }),
);

// The mobile twin of `requestPasswordReset`, which now needs a captcha token
// the app cannot produce. Same rate limits, no captcha (JEF-401).
builder.mutationField('requestPasswordResetMobile', (t) =>
  t.boolean({
    args: {
      email: t.arg.string({ required: true }),
    },
    resolve: async (_root, args, ctx) => {
      const { authResolver } = ctx.diScope.cradle;
      try {
        await authResolver.requestPasswordReset(args.email, ctx.request.ip ?? null, {
          enforce: false,
        });
        return true;
      } catch (err) {
        throw fromCodedError(err);
      }
    },
  }),
);

builder.mutationField('loginWithTotpMobile', (t) =>
  t.field({
    type: MobileAuthPayloadRef,
    args: {
      email: t.arg.string({ required: true }),
      password: t.arg.string({ required: true }),
      code: t.arg.string({ required: true }),
    },
    resolve: async (_root, args, ctx) => {
      const { authResolver } = ctx.diScope.cradle;
      return authResolver.loginWithTotp(
        args.email,
        args.password,
        args.code,
        deviceInfoFrom(ctx.request),
      );
    },
  }),
);

builder.mutationField('refreshTokenMobile', (t) =>
  t.field({
    type: MobileAuthPayloadRef,
    args: {
      refreshToken: t.arg.string({ required: true }),
    },
    resolve: async (_root, args, ctx) => {
      const { authResolver } = ctx.diScope.cradle;
      return authResolver.refreshToken(args.refreshToken);
    },
  }),
);

/**
 * Redeems the short-lived code the OAuth callback hands back through the
 * custom-scheme redirect (JEF-275) — see MobileOAuthHandoffService. The
 * browser leg of Google/GitHub sign-in is server-mediated same as web; this
 * is purely the last hop, getting the resulting tokens from that redirect
 * into the app's own storage over a normal authenticated-transport request
 * instead of a URL.
 *
 * `codeVerifier` is the PKCE verifier the app generated before opening the
 * browser (see `loginWithOAuth` in AuthContext.tsx) — required so redeeming
 * the code takes more than just having intercepted the redirect.
 */
builder.mutationField('exchangeMobileOAuthCode', (t) =>
  t.field({
    type: MobileAuthPayloadRef,
    args: {
      code: t.arg.string({ required: true }),
      codeVerifier: t.arg.string({ required: true }),
    },
    resolve: async (_root, args, ctx) => {
      const { oauthResolver } = ctx.diScope.cradle;
      try {
        return await oauthResolver.exchangeMobileCode(args.code, args.codeVerifier);
      } catch (err) {
        throw fromCodedError(err);
      }
    },
  }),
);

builder.mutationField('reauthenticateMobile', (t) =>
  t.field({
    type: MobileLoginResultRef,
    args: {
      password: t.arg.string({ required: true }),
      code: t.arg.string({ required: false }),
    },
    resolve: async (_root, args, ctx) => {
      if (!ctx.user || !ctx.user.sid)
        throw new GraphQLError('Unauthorized', { extensions: { code: ERROR_CODES.UNAUTHORIZED } });
      const { authResolver } = ctx.diScope.cradle;
      try {
        // Same session, re-signed with a fresh authTime — the step-up the
        // cookie `reauthenticate` performs, with the tokens in the body.
        const result = await authResolver.reauthenticate(
          ctx.user.sub,
          ctx.user.sid,
          args.password,
          args.code ?? undefined,
        );
        return {
          success: !result.totpRequired,
          totpRequired: result.totpRequired,
          accessToken: result.tokens?.accessToken ?? null,
          refreshToken: result.tokens?.refreshToken ?? null,
        };
      } catch (err) {
        throw fromCodedError(err);
      }
    },
  }),
);
