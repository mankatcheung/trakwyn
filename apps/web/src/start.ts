import { createCsrfMiddleware, createMiddleware, createStart } from '@tanstack/react-start';
import { getServerLogger } from '#/server/observability/getServerLogger';
import { reportServerFnErrors } from '#/server/observability/reportServerErrors';

/**
 * Without a start instance, TanStack Start applies exactly this CSRF check to
 * server-function requests on its own. Declaring `requestMiddleware` below
 * replaces that default rather than adding to it, so it is restated here —
 * dropping it would leave `getRequiresCookieConsent` open to cross-site calls.
 */
const csrfMiddleware = createCsrfMiddleware({
  filter: (ctx) => ctx.handlerType === 'serverFn',
});

/** Reports a server function's error to PostHog before the client gets its 500 (JEF-359, JEF-374). */
const serverFnErrorReporting = createMiddleware({ type: 'function' }).server(
  reportServerFnErrors(getServerLogger),
);

export const startInstance = createStart(() => ({
  requestMiddleware: [csrfMiddleware],
  functionMiddleware: [serverFnErrorReporting],
}));
