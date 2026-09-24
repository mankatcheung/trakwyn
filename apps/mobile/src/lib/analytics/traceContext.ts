import { getRandomBytes } from 'expo-crypto';

/**
 * W3C trace context for outbound API requests (JEF-349) — the mobile
 * counterpart of apps/web/src/lib/analytics/traceContext.ts.
 *
 * Sending a `traceparent` makes the app the root of the API's trace, so an
 * exception in PostHog and a trace in Axiom share an identifier. The API
 * needs no change to accept it: OTel's default propagator is W3C trace
 * context.
 *
 * The one real difference from web is the random source. React Native's
 * JS runtime has no `crypto.getRandomValues` — the Web Crypto API is a
 * browser thing, and Hermes does not provide it — so this uses
 * `expo-crypto`'s `getRandomBytes`, which is synchronous and already a
 * dependency of the app.
 */

const TRACEPARENT_VERSION = '00';
const SAMPLED_FLAGS = '01';

const TRACE_ID_BYTES = 16;
const SPAN_ID_BYTES = 8;

export interface TraceContext {
  traceId: string;
  traceparent: string;
}

function randomHex(byteLength: number): string {
  const bytes = getRandomBytes(byteLength);
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
 * Only our own API ever receives it. The header on a third-party request
 * would be a correlation id across our users' requests handed to that
 * party, and is exactly the sort of thing that is easy to add by accident
 * once a header is set in a shared client.
 *
 * Both URLs are absolute on mobile (there is no document to resolve a
 * relative one against), so an unparseable value is a configuration error
 * rather than a relative path, and answers "not ours".
 */
export function isApiRequest(url: string, apiUrl: string): boolean {
  try {
    return new URL(url).origin === new URL(apiUrl).origin;
  } catch {
    return false;
  }
}

let lastTraceId: string | null = null;

/**
 * Remembers the trace id of the most recent API request so an exception
 * captured moments later can name it — a correlation hint, not a claim of
 * causation. See the web copy for the full reasoning.
 */
export function rememberTraceId(traceId: string): void {
  lastTraceId = traceId;
}

export function getLastTraceId(): string | null {
  return lastTraceId;
}

/** Test seam: drops the remembered id between tests. */
export function resetTraceContext(): void {
  lastTraceId = null;
}
