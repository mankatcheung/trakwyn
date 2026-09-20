/**
 * W3C trace context for outbound API requests (JEF-349).
 *
 * The API is traced end-to-end into Axiom, but a trace only ever started at
 * the HTTP span — so an error the user reported and a trace in Axiom had no
 * shared identifier. Sending a `traceparent` makes the browser the root of
 * the trace, and recording the same trace id on PostHog exception events is
 * the jump from "this user hit an error" to the server-side trace of the
 * request that produced it.
 *
 * Nothing else is needed on the API side: OTel's default propagator is W3C
 * trace context, so an incoming `traceparent` is adopted automatically, and
 * `corsPlugin.ts` sets no `allowedHeaders`, so `@fastify/cors` echoes
 * whatever the preflight asks for.
 *
 * This is not tracing in the browser — there are no client spans, and the
 * span id below names a span that is never exported. It is the correlation
 * id the API's trace will hang off, and the groundwork for real browser
 * spans later (deliberately out of scope here).
 */

/** `version-traceId-spanId-flags`, with flags `01` = sampled. */
const TRACEPARENT_VERSION = '00';
const SAMPLED_FLAGS = '01';

const TRACE_ID_BYTES = 16;
const SPAN_ID_BYTES = 8;

export interface TraceContext {
  traceId: string;
  traceparent: string;
}

function randomHex(byteLength: number): string {
  const bytes = new Uint8Array(byteLength);
  if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') {
    crypto.getRandomValues(bytes);
  } else {
    // No WebCrypto (an old browser, or a non-DOM test environment). These ids
    // only need to be unique, never unguessable — they carry no authority and
    // identify nothing on their own — so a weaker source is a correctness
    // non-issue here, unlike everywhere else a random value is generated.
    for (let i = 0; i < bytes.length; i += 1) bytes[i] = Math.floor(Math.random() * 256);
  }
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

export function newTraceContext(): TraceContext {
  const traceId = randomHex(TRACE_ID_BYTES);
  return {
    traceId,
    traceparent: `${TRACEPARENT_VERSION}-${traceId}-${randomHex(SPAN_ID_BYTES)}-${SAMPLED_FLAGS}`,
  };
}

/**
 * Whether `traceparent` may be attached to a request for `url`.
 *
 * The header is only ever sent to our own API. Attaching it to a third-party
 * request would hand that party a correlation id across our users' requests,
 * and would trip CORS on any endpoint that does not happen to echo the
 * header back — the upload `PUT` to Vercel Blob being the live example.
 *
 * Both arguments may be relative (`/graphql` is the dev-proxy default), in
 * which case they are resolved against the current document, exactly as
 * `fetch` would.
 */
export function isApiRequest(url: string, apiUrl: string): boolean {
  const base = typeof window === 'undefined' ? undefined : window.location.origin;
  try {
    return new URL(url, base).origin === new URL(apiUrl, base).origin;
  } catch {
    // An unresolvable URL (no document to resolve a relative one against)
    // is not something we can claim is ours.
    return false;
  }
}

let lastTraceId: string | null = null;

/**
 * Remembers the trace id of the most recent API request so an exception
 * captured moments later can name it.
 *
 * A single id rather than a per-request map: an error surfaces from a render
 * or a rejected promise with no handle on the request that caused it, and
 * the request that just failed is overwhelmingly the one being asked about.
 * It is a hint for correlation, never an assertion of causation — which is
 * why it is reported as `trace_id` and not, say, `caused_by`.
 */
export function rememberTraceId(traceId: string): void {
  lastTraceId = traceId;
}

export function getLastTraceId(): string | null {
  return lastTraceId;
}

/** Test seam: drops the remembered id so one test's request cannot colour the next one's assertions. */
export function resetTraceContext(): void {
  lastTraceId = null;
}
