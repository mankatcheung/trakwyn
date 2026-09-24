import { isNotFound, isRedirect } from '@tanstack/react-router';
import { describeRequest, SERVER_LOG_EVENTS, type ServerLogger } from './serverLogger';

/**
 * The places a server-side failure can be seen in TanStack Start (JEF-359):
 *
 *  - **Load:** a loader or `beforeLoad` that throws is caught by the router
 *    and stored on its match; the page still renders (the route's error
 *    component) with a 500. Read from `router.state.matches` after load.
 *  - **Render, inside a boundary:** every route component sits in a Suspense
 *    boundary, so a component that throws does not fail the response — it
 *    is a 200, and the browser re-renders the boundary. React reports the
 *    error only to the renderer's `onError`, which TanStack does not expose
 *    and forwards to `console.error("Error in renderTo…:", error)`. That call
 *    is the one observable point, so `installRenderErrorCapture` watches it.
 *  - **Render, the shell:** a throw outside any boundary (the root document)
 *    aborts the render and the stream handler rethrows it.
 *  - **Server function:** `handleServerAction` serialises the error into a
 *    500 for the client, so only a function middleware sees it thrown.
 */

/** Errors already reported, so an outer layer does not report the same one again. */
const reported = new WeakSet<object>();

function markReported(error: unknown): void {
  if (typeof error === 'object' && error !== null) reported.add(error);
}

function wasReported(error: unknown): boolean {
  return typeof error === 'object' && error !== null && reported.has(error);
}

/** Redirects and not-founds are thrown as control flow; they are not failures. */
function isControlFlow(error: unknown): boolean {
  return isRedirect(error) || isNotFound(error) || error instanceof Response;
}

type GetLogger = () => ServerLogger;

interface MatchLike {
  routeId: string;
  status: string;
  error?: unknown;
}

interface HandlerContext {
  request: Request;
  router: { state: { matches: readonly MatchLike[] } };
}

/**
 * Wraps the stream handler `createStartHandler` calls once the router has
 * loaded: reports each errored match, then any error the shell render throws.
 */
export function withRenderReporting<TCtx extends HandlerContext, TResult>(
  handler: (ctx: TCtx) => TResult | Promise<TResult>,
  getLogger: GetLogger,
): (ctx: TCtx) => Promise<TResult> {
  return async (ctx) => {
    const request = describeRequest(ctx.request);
    for (const match of ctx.router.state.matches) {
      // A server function a loader called has already been reported by name.
      if (match.status !== 'error' || isControlFlow(match.error) || wasReported(match.error)) {
        continue;
      }
      await getLogger().error(
        SERVER_LOG_EVENTS.SSR_FAILED,
        { ...request, phase: 'load', routeId: match.routeId },
        match.error,
      );
      markReported(match.error);
    }

    try {
      return await handler(ctx);
    } catch (error) {
      if (!ctx.request.signal.aborted && !isControlFlow(error) && !wasReported(error)) {
        await getLogger().error(
          SERVER_LOG_EVENTS.SSR_FAILED,
          { ...request, phase: 'shell', routeId: ctx.router.state.matches.at(-1)?.routeId },
          error,
        );
        markReported(error);
      }
      throw error;
    }
  };
}

/**
 * Wraps the whole request handler, as the backstop for anything that
 * escaped before the router ran (manifest, middleware, entry loading).
 * A client that disconnected is not a failure, so aborted requests are
 * skipped.
 */
export function withRequestReporting<TArgs extends [Request, ...unknown[]], TResult>(
  fetchHandler: (...args: TArgs) => TResult | Promise<TResult>,
  getLogger: GetLogger,
): (...args: TArgs) => Promise<TResult> {
  return async (...args) => {
    const [request] = args;
    try {
      return await fetchHandler(...args);
    } catch (error) {
      if (!request.signal.aborted && !wasReported(error) && !isControlFlow(error)) {
        await getLogger().error(SERVER_LOG_EVENTS.REQUEST_FAILED, describeRequest(request), error);
        markReported(error);
      }
      throw error;
    }
  };
}

interface ServerFnContext<TResult> {
  next: () => Promise<TResult>;
  method: string;
  serverFnMeta: { name: string; filename: string };
}

/**
 * The server half of a function middleware: reports a handler's error by the
 * function's name and file — never its input, which is user data — then
 * rethrows it so the client still receives the same serialised failure.
 */
export function reportServerFnErrors(getLogger: GetLogger) {
  return async <TResult>({ next, method, serverFnMeta }: ServerFnContext<TResult>) => {
    try {
      return await next();
    } catch (error) {
      if (!isControlFlow(error) && !wasReported(error)) {
        await getLogger().error(
          SERVER_LOG_EVENTS.SERVER_FN_FAILED,
          {
            'server_fn.name': serverFnMeta.name,
            'server_fn.file': serverFnMeta.filename,
            'http.method': method,
          },
          error,
        );
        markReported(error);
      }
      throw error;
    }
  };
}

/**
 * The prefix TanStack's `renderRouterToStream` gives the `console.error` it
 * makes from React's `onError` (`Error in renderToReadableStream:` or
 * `…renderToPipeableStream:`). `renderErrorCapture.test.ts` reads the
 * installed TanStack source and fails if that call ever changes shape, since
 * a silent change here would stop render errors reaching Axiom without any
 * other symptom.
 */
export const RENDER_ERROR_PREFIX = 'Error in renderTo';

interface RenderErrorCaptureOptions {
  getLogger: GetLogger;
  /** The in-flight request, when there is one (TanStack's request context). */
  getRequest: () => Request | undefined;
  /** Keeps the function alive until the send settles (Vercel's `waitUntil`). */
  keepAlive: (promise: Promise<unknown>) => void;
  target?: Pick<Console, 'error'>;
}

/**
 * Reports React render errors from inside a Suspense boundary by watching
 * the one place they surface. The original `console.error` still runs first
 * and unchanged, so Vercel's runtime log is exactly as before. The send is
 * handed to `keepAlive` rather than awaited: the call happens mid-stream,
 * after the response has started, and cannot hold anything up. Returns the
 * uninstall function (for tests).
 */
export function installRenderErrorCapture({
  getLogger,
  getRequest,
  keepAlive,
  target = console,
}: RenderErrorCaptureOptions): () => void {
  const original = target.error;
  target.error = (...args: unknown[]) => {
    original.apply(target, args);
    const [message, error] = args;
    if (typeof message !== 'string' || !message.startsWith(RENDER_ERROR_PREFIX)) return;
    if (isControlFlow(error) || wasReported(error)) return;
    markReported(error);

    let request: Record<string, string> = {};
    try {
      const current = getRequest();
      if (current) request = describeRequest(current);
    } catch {
      // Outside a request context: report without the request fields.
    }
    keepAlive(
      getLogger().error(SERVER_LOG_EVENTS.SSR_FAILED, { ...request, phase: 'render' }, error),
    );
  };
  return () => {
    target.error = original;
  };
}
