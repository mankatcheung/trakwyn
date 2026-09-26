import { scrubString, scrubValue } from '#/lib/analytics/scrub';
import { buildExceptionList } from './exceptionList';
import { INGEST_TIMEOUT_MS, SERVICE_NAME, type ServerLogConfig } from './serverLogConfig';

/**
 * The events the Vercel function emits. Stable dotted names, as the API does:
 * the stdout line carries one as `event`, and the PostHog `$exception` as
 * `web_event`, so a filter keys on the name rather than on prose a later
 * edit would break. Every reportable one ends `.failed`.
 */
export const SERVER_LOG_EVENTS = {
  /**
   * A server render failed: a loader/beforeLoad threw (`phase: 'load'`), a
   * component threw inside its boundary (`'render'`, still a 200), or the
   * document shell itself could not render (`'shell'`).
   */
  SSR_FAILED: 'web.ssr.failed',
  /** A `createServerFn` handler threw. */
  SERVER_FN_FAILED: 'web.server_fn.failed',
  /** Anything else that escaped the request handler. */
  REQUEST_FAILED: 'web.request.failed',
  /** The capture POST itself failed; written to stdout only, never re-sent. */
  INGEST_FAILED: 'web.log.ingest_failed',
} as const;

export type ServerLogEvent = (typeof SERVER_LOG_EVENTS)[keyof typeof SERVER_LOG_EVENTS];

export interface ServerLogger {
  /** Never rejects: a logging failure must not replace the error being reported. */
  error(event: ServerLogEvent, fields: Record<string, unknown>, error?: unknown): Promise<void>;
}

export interface ServerLoggerOptions {
  config: ServerLogConfig | null;
  release?: string;
  fetchFn?: typeof fetch;
  write?: (line: string) => void;
  now?: () => Date;
  /** The `distinct_id` when the report has no Vercel request id. */
  newId?: () => string;
}

/**
 * The error's type, message and stack, each through the same pattern
 * redaction PostHog events get: a message quotes the value that broke, and
 * that value can be an email or a token from the URL.
 */
export function describeError(error: unknown): Record<string, string> {
  if (error instanceof Error) {
    return {
      'error.type': error.name,
      'error.message': scrubString(error.message),
      ...(error.stack ? { 'error.stack': scrubString(error.stack) } : {}),
    };
  }
  return { 'error.type': typeof error };
}

/**
 * Only the method and the path. The query string is where this app's tokens
 * live (`/reset-password?token=…`, `/share?token=…`), and no header is read
 * at all — not the cookies, not `Authorization` — except Vercel's request id,
 * which links the line to Vercel's own runtime log for the same request.
 */
export function describeRequest(request: Request): Record<string, string> {
  let path = '[unparseable]';
  try {
    path = scrubString(new URL(request.url).pathname);
  } catch {
    // Keep the placeholder: a malformed URL is not worth failing the report over.
  }
  const vercelId = request.headers.get('x-vercel-id');
  return {
    'http.method': request.method,
    'url.path': path,
    ...(vercelId ? { 'vercel.request_id': vercelId } : {}),
  };
}

/** `$lib` on every server event, so Error Tracking can tell them from the browser's. */
export const SERVER_LIB = 'trakwyn-web-server';

/**
 * The capture body for one error. Operational data, not analytics: it is
 * sent without the consent gate, as the Axiom lines were before it, and so
 * carries nothing that identifies a person —
 *
 *  - `$process_person_profile: false`, and a `distinct_id` that is Vercel's
 *    request id (or a random one), never a user id or cookie;
 *  - no IP worth keeping: the request comes from the Vercel function, the
 *    project discards IPs anyway (`anonymize_ips`), and GeoIP is skipped;
 *  - only the scrubbed fields `describeRequest` and the callers pass.
 */
function toCaptureBody(
  config: ServerLogConfig,
  event: ServerLogEvent,
  fields: Record<string, unknown>,
  error: unknown,
  meta: { timestamp: string; release?: string; distinctId: string },
): Record<string, unknown> {
  return {
    api_key: config.apiKey,
    event: '$exception',
    distinct_id: meta.distinctId,
    timestamp: meta.timestamp,
    properties: {
      ...fields,
      $exception_list: buildExceptionList(error, event),
      $exception_level: 'error',
      $process_person_profile: false,
      $geoip_disable: true,
      $lib: SERVER_LIB,
      source: 'server',
      service: SERVICE_NAME,
      web_event: event,
      ...(meta.release ? { release: meta.release } : {}),
    },
  };
}

export function createServerLogger({
  config,
  release,
  fetchFn = fetch,
  write = (line) => console.error(line),
  now = () => new Date(),
  newId = () => crypto.randomUUID(),
}: ServerLoggerOptions): ServerLogger {
  // Takes a builder rather than a body, so a throw while building (a stack
  // the parser chokes on) is caught here too and the report still resolves.
  const send = async (
    target: ServerLogConfig,
    build: () => Record<string, unknown>,
  ): Promise<void> => {
    try {
      const response = await fetchFn(target.captureUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(build()),
        signal: AbortSignal.timeout(INGEST_TIMEOUT_MS),
      });
      if (!response.ok) {
        // Status only: PostHog's error body is not ours to copy into a log.
        writeLine({ event: SERVER_LOG_EVENTS.INGEST_FAILED, status: response.status });
      }
    } catch (err) {
      writeLine({
        event: SERVER_LOG_EVENTS.INGEST_FAILED,
        'error.type': err instanceof Error ? err.name : typeof err,
      });
    }
  };

  const writeLine = (fields: Record<string, unknown>): void => {
    try {
      write(JSON.stringify({ _time: now().toISOString(), service: SERVICE_NAME, ...fields }));
    } catch {
      // stdout is the last resort; there is nowhere left to report to.
    }
  };

  return {
    async error(event, fields, error) {
      const timestamp = now().toISOString();
      const scrubbed = scrubValue(fields) as Record<string, unknown>;
      // Always to stdout as well, so Vercel's runtime log keeps a (scrubbed)
      // copy when export is off or PostHog is unreachable.
      writeLine({
        _time: timestamp,
        level: 'error',
        ...(release ? { release } : {}),
        event,
        ...scrubbed,
        ...(error === undefined ? {} : describeError(error)),
      });
      if (!config) return;
      const requestId = scrubbed['vercel.request_id'];
      await send(config, () =>
        toCaptureBody(config, event, scrubbed, error, {
          timestamp,
          release,
          distinctId: typeof requestId === 'string' ? requestId : newId(),
        }),
      );
    },
  };
}
