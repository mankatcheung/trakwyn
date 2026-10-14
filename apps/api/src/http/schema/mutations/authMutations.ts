import { GraphQLError } from 'graphql';
import { builder } from '#src/http/schema/builder.js';
import { setAuthCookies, clearAuthCookies } from '#src/http/schema/types/AuthPayloadType.js';
import { LoginResultRef } from '#src/http/schema/types/LoginResultType.js';
import { deviceInfoFrom } from '#src/http/schema/requestDeviceInfo.js';
import { parseTrakwynClientUserAgent } from '#src/infrastructure/device/trakwynClientUserAgent.js';
import { fromCodedError } from '#src/http/errors/AppError.js';
import { ERROR_CODES } from '#src/use-cases/errors/errorCodes.js';
import { COOKIES } from '#src/http/constants.js';

builder.mutationField('register', (t) =>
  t.string({
    args: {
      email: t.arg.string({ required: true }),
      password: t.arg.string({ required: true }),
      captchaToken: t.arg.string(),
    },
    resolve: async (_root, args, ctx) => {
      const { authResolver } = ctx.diScope.cradle;
      const tokens = await authResolver.register(
        args.email,
        args.password,
        deviceInfoFrom(ctx.request),
        { token: args.captchaToken, enforce: true },
      );
      setAuthCookies(ctx.reply, tokens.accessToken, tokens.refreshToken);
      return tokens.accessToken;
    },
  }),
);

builder.mutationField('login', (t) =>
  t.field({
    type: LoginResultRef,
    args: {
      email: t.arg.string({ required: true }),
      password: t.arg.string({ required: true }),
      captchaToken: t.arg.string(),
    },
    resolve: async (_root, args, ctx) => {
      const { authResolver } = ctx.diScope.cradle;
      const result = await authResolver.login(
        args.email,
        args.password,
        deviceInfoFrom(ctx.request),
        { token: args.captchaToken, enforce: true },
      );
      if (result.tokens) {
        setAuthCookies(ctx.reply, result.tokens.accessToken, result.tokens.refreshToken);
      }
      return {
        success: !result.totpRequired,
        totpRequired: result.totpRequired,
        accessToken: result.tokens?.accessToken ?? null,
      };
    },
  }),
);

builder.mutationField('loginWithTotp', (t) =>
  t.string({
    args: {
      email: t.arg.string({ required: true }),
      password: t.arg.string({ required: true }),
      code: t.arg.string({ required: true }),
    },
    resolve: async (_root, args, ctx) => {
      const { authResolver } = ctx.diScope.cradle;
      const tokens = await authResolver.loginWithTotp(
        args.email,
        args.password,
        args.code,
        deviceInfoFrom(ctx.request),
      );
      setAuthCookies(ctx.reply, tokens.accessToken, tokens.refreshToken);
      return tokens.accessToken;
    },
  }),
);

builder.mutationField('reauthenticate', (t) =>
  t.field({
    type: LoginResultRef,
    args: {
      password: t.arg.string({ required: true }),
      code: t.arg.string({ required: false }),
    },
    resolve: async (_root, args, ctx) => {
      if (!ctx.user || !ctx.user.sid)
        throw new GraphQLError('Unauthorized', { extensions: { code: ERROR_CODES.UNAUTHORIZED } });
      const { authResolver } = ctx.diScope.cradle;
      try {
        const result = await authResolver.reauthenticate(
          ctx.user.sub,
          ctx.user.sid,
          args.password,
          args.code ?? undefined,
        );
        if (result.tokens) {
          setAuthCookies(ctx.reply, result.tokens.accessToken, result.tokens.refreshToken);
        }
        return {
          success: !result.totpRequired,
          totpRequired: result.totpRequired,
          accessToken: result.tokens?.accessToken ?? null,
        };
      } catch (err) {
        throw fromCodedError(err);
      }
    },
  }),
);

builder.mutationField('refreshToken', (t) =>
  t.string({
    resolve: async (_root, _args, ctx) => {
      const refreshTokenCookie = ctx.request.cookies[COOKIES.REFRESH_TOKEN];
      if (!refreshTokenCookie) {
        // No cookie to act on, but trakwyn_logged_in may still be lingering
        // (e.g. cleared manually, or a pre-existing inconsistent state) —
        // clear it too so the client's session check converges to "logged
        // out" instead of endlessly believing a session that isn't there.
        clearAuthCookies(ctx.reply);
        throw new GraphQLError('No refresh token', {
          extensions: { code: ERROR_CODES.UNAUTHORIZED },
        });
      }
      const { authResolver } = ctx.diScope.cradle;
      try {
        const tokens = await authResolver.refreshToken(refreshTokenCookie);
        setAuthCookies(ctx.reply, tokens.accessToken, tokens.refreshToken);
        return tokens.accessToken;
      } catch (err) {
        // A dead session (expired, revoked, or reuse-detected) must not
        // leave the non-HttpOnly trakwyn_logged_in hint cookie behind —
        // otherwise the web app's client-side session check keeps
        // believing it's authenticated, redirects away from /login back
        // to a protected route, that route's data fetch fails the same
        // way, and it bounces between the two indefinitely until the
        // cookie's own 7-day lifetime runs out.
        clearAuthCookies(ctx.reply);
        throw fromCodedError(err);
      }
    },
  }),
);

builder.mutationField('logout', (t) =>
  t.boolean({
    resolve: async (_root, _args, ctx) => {
      if (ctx.user?.sid) {
        // Best-effort — an already-expired/missing session shouldn't block logout.
        const { revokeSessionUseCase } = ctx.diScope.cradle;
        await revokeSessionUseCase.execute(ctx.user.sid, ctx.user.sub).catch(() => {});
      }
      clearAuthCookies(ctx.reply);
      return true;
    },
  }),
);

builder.mutationField('requestPasswordReset', (t) =>
  t.boolean({
    args: {
      email: t.arg.string({ required: true }),
      captchaToken: t.arg.string(),
    },
    resolve: async (_root, args, ctx) => {
      const { authResolver } = ctx.diScope.cradle;
      // App builds already in the stores call this mutation, not
      // `requestPasswordResetMobile`, and cannot produce a token (JEF-401). They
      // are recognised by the User-Agent only the app sends. The header is the
      // caller's to set, which is no weaker than `requestPasswordResetMobile`
      // being callable by anyone: the per-email and per-IP limits are what hold.
      const fromMobileApp =
        parseTrakwynClientUserAgent(deviceInfoFrom(ctx.request).userAgent) !== null;
      try {
        await authResolver.requestPasswordReset(args.email, ctx.request.ip ?? null, {
          token: args.captchaToken,
          enforce: !fromMobileApp,
        });
        return true;
      } catch (err) {
        throw fromCodedError(err);
      }
    },
  }),
);

builder.mutationField('resetPassword', (t) =>
  t.boolean({
    args: {
      token: t.arg.string({ required: true }),
      newPassword: t.arg.string({ required: true }),
    },
    resolve: async (_root, args, ctx) => {
      const { authResolver } = ctx.diScope.cradle;
      try {
        await authResolver.resetPassword(args.token, args.newPassword);
        return true;
      } catch (err) {
        throw fromCodedError(err);
      }
    },
  }),
);

builder.mutationField('verifyEmail', (t) =>
  t.boolean({
    args: {
      token: t.arg.string({ required: true }),
    },
    resolve: async (_root, args, ctx) => {
      const { authResolver } = ctx.diScope.cradle;
      try {
        await authResolver.verifyEmail(args.token);
        return true;
      } catch (err) {
        throw fromCodedError(err);
      }
    },
  }),
);

builder.mutationField('requestBackupEmailRecovery', (t) =>
  t.boolean({
    args: {
      backupEmail: t.arg.string({ required: true }),
    },
    resolve: async (_root, args, ctx) => {
      const { authResolver } = ctx.diScope.cradle;
      try {
        await authResolver.requestBackupEmailRecovery(args.backupEmail, ctx.request.ip ?? null);
        return true;
      } catch (err) {
        throw fromCodedError(err);
      }
    },
  }),
);
