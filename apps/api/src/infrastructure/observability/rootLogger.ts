import type { ILogger, LogFields } from '#src/use-cases/ports/ILogger.js';

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
/**
 * Only what was actually given: pino reads a leading object as its merge
 * target, so a trailing `undefined` would cost the message on the real
 * logger, and on the console it is one more word of noise in a line someone
 * is reading during startup.
 */
const consoleArgs = (message: string, err: unknown, fields?: LogFields): unknown[] => {
  const args: unknown[] = [message];
  if (err !== undefined) args.push(err);
  if (fields !== undefined) args.push(fields);
  return args;
};

const consoleFallback: ILogger = {
  error: (message, err, fields) => console.error(...consoleArgs(message, err, fields)),
  warn: (message, err, fields) => console.warn(...consoleArgs(message, err, fields)),
  info: (message, fields) => console.info(...consoleArgs(message, undefined, fields)),
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
  error: (message, err, fields) => current.error(message, err, fields),
  warn: (message, err, fields) => current.warn(message, err, fields),
  info: (message, fields) => current.info(message, fields),
};
