import type { ILogger } from '#src/use-cases/ports/ILogger.js';

/**
 * The process-wide `ILogger`, for the infrastructure singletons that have no
 * container to be injected from (JEF-351).
 *
 * Most code gets its logger from the Awilix cradle, which `buildApp` fills
 * with a `PinoLogger` over `fastify.log` — and anything that can should keep
 * doing that, because a request-scoped child logger carries the request id
 * the rest of the trace is keyed by. But three things are built while that
 * container does not exist yet: the Postgres pool (`db/client.ts` runs
 * `createDb` at module load, under a top-level await), and the cache and
 * session blocklist (`http/di/infrastructure.ts` registers them with
 * `asValue`, so they are constructed as that module is evaluated). Each of
 * them logs later, at request time, long after `buildApp` has run.
 *
 * So the indirection is in *when* the logger is resolved, not in whether it
 * is injected: `rootLogger` is a stable object those singletons can hold from
 * construction, and each call forwards to whatever `setRootLogger` has most
 * recently been given. They still take a `logger` dependency with this as its
 * default, exactly as they take `metrics = otelMetrics`, so a test injects a
 * fake instead of reaching in here.
 *
 * Until `setRootLogger` runs, lines go to the console — the same place they
 * went before this module existed. That window is startup only, and dropping
 * a pool error thrown during it would be worse than logging it somewhere that
 * reaches Cloud Logging but not Axiom.
 */
const consoleFallback: ILogger = {
  error: (message, err) => console.error(message, err),
  warn: (message, err) => {
    if (err === undefined) console.warn(message);
    else console.warn(message, err);
  },
};

let current: ILogger = consoleFallback;

/** Called once by `buildApp`, with the same `PinoLogger` the cradle gets. */
export function setRootLogger(logger: ILogger): void {
  current = logger;
}

/** Restores the console fallback. For tests that swap the logger. */
export function resetRootLogger(): void {
  current = consoleFallback;
}

export const rootLogger: ILogger = {
  error: (message, err) => current.error(message, err),
  warn: (message, err) => current.warn(message, err),
};
