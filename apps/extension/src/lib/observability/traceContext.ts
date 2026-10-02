/**
 * W3C trace context for requests to the API (JEF-387), ported from
 * apps/web/src/lib/analytics/traceContext.ts.
 *
 * Sending a `traceparent` makes the extension the root of the API's trace in
 * Axiom, and reporting the same trace id on PostHog events is the jump from
 * "the Clipper hit an error" to the server-side trace of that request.
 *
 * Nothing is needed on the API side: OTel adopts an incoming `traceparent`,
 * and `corsPlugin.ts` sets no `allowedHeaders`, so the preflight is echoed.
 *
 * The header goes to the API only. `gql` in lib/api.ts is its one caller and
 * the configured API URL is that function's one destination, so there is no
 * origin check here as there is on web. The report to PostHog never gets it.
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
  const bytes = crypto.getRandomValues(new Uint8Array(byteLength));
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

export function newTraceContext(): TraceContext {
  const traceId = randomHex(TRACE_ID_BYTES);
  return {
    traceId,
    traceparent: `${TRACEPARENT_VERSION}-${traceId}-${randomHex(SPAN_ID_BYTES)}-${SAMPLED_FLAGS}`,
  };
}

let lastTraceId: string | null = null;

/**
 * Remembers the trace id of the most recent API request, so an exception
 * captured moments later can name it. A hint for correlation, never an
 * assertion of causation.
 */
export function rememberTraceId(traceId: string): void {
  lastTraceId = traceId;
}

export function getLastTraceId(): string | null {
  return lastTraceId;
}

/** Test seam: drops the remembered id. */
export function resetTraceContext(): void {
  lastTraceId = null;
}
