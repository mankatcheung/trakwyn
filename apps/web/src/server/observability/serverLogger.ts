import { scrubString, scrubValue } from '#/lib/analytics/scrub';
import { INGEST_TIMEOUT_MS, SERVICE_NAME, type ServerLogConfig } from './serverLogConfig';

/**
 * The events the Vercel function emits. Stable dotted names on an `event`
 * field, as the API does, so the Axiom monitor keys on the name rather than
 * on prose a later edit would break. Every one ends `.failed`, which is what
 * `infra/axiom/monitors.tf`'s `web_server_error` matches — renaming one means
 * updating that monitor in the same change.
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
  /** The ingest POST itself failed; written to stdout only, never re-sent. */
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

export function createServerLogger({
  config,
  release,
  fetchFn = fetch,
  write = (line) => console.error(line),
  now = () => new Date(),
}: ServerLoggerOptions): ServerLogger {
  const send = async (record: Record<string, unknown>): Promise<void> => {
    if (!config) return;
    try {
      const response = await fetchFn(config.ingestUrl, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${config.token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify([record]),
        signal: AbortSignal.timeout(INGEST_TIMEOUT_MS),
      });
      if (!response.ok) {
        // Status only: Axiom's error body is not ours to copy into a log.
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
      const record = {
        _time: now().toISOString(),
        level: 'error',
        service: SERVICE_NAME,
        ...(release ? { release } : {}),
        event,
        ...(scrubValue(fields) as Record<string, unknown>),
        ...(error === undefined ? {} : describeError(error)),
      };
      // Always to stdout as well, so Vercel's runtime log keeps a (scrubbed)
      // copy when export is off or Axiom is unreachable.
      writeLine(record);
      await send(record);
    },
  };
}
