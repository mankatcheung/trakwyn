import { createStartHandler, defaultStreamHandler, getRequest } from '@tanstack/react-start/server';
import { createServerEntry } from '@tanstack/react-start/server-entry';
import { getServerLogger } from '#/server/observability/getServerLogger';
import {
  installRenderErrorCapture,
  withRenderReporting,
  withRequestReporting,
} from '#/server/observability/reportServerErrors';
import { vercelWaitUntil } from '#/server/observability/vercelWaitUntil';

// TanStack Start's default server entry, with server-side errors reported to
// Axiom's trakwyn-web dataset (JEF-359). Server-function errors are reported
// by the function middleware in src/start.ts instead: they never reach here
// as a throw. See reportServerErrors.ts for which layer sees what.
installRenderErrorCapture({
  getLogger: getServerLogger,
  getRequest,
  keepAlive: vercelWaitUntil,
});

const fetch = createStartHandler(withRenderReporting(defaultStreamHandler, getServerLogger));

export default createServerEntry({ fetch: withRequestReporting(fetch, getServerLogger) });
