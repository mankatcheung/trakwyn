/**
 * A temporary diagnostic for JEF-353.
 *
 * `NodeSDK`'s default sampler is `ParentBased(root: AlwaysOn)` and its default
 * propagator is W3C trace context, neither of which this codebase overrides.
 * So when a request arrives carrying a `traceparent`, that header's sampled
 * flag — not our `AlwaysOn` root sampler — decides whether the trace exists at
 * all. Cloud Run's front end injects trace context into inbound requests, and
 * a trace dropped this way produces no spans, no export and no error: the loss
 * is invisible, which is why it has to be measured rather than reasoned about.
 *
 * This records what actually arrives, so the ratio can be read off Axiom and
 * cross-checked against Cloud Run's request count before anyone changes a
 * sampler. It is expected to be deleted, or converted into a permanent
 * counter, once that question is answered.
 */

import type { IncomingHttpHeaders } from 'node:http';

import type { LogFields } from '#src/use-cases/ports/ILogger.js';
import { ENV } from '#src/infrastructure/config/constants.js';

/** Stable dotted name, so an Axiom query keys on the field and not the wording. */
export const INBOUND_TRACEPARENT_EVENT = 'observability.inbound_traceparent';

/** The line's message. The facts are all in the fields. */
export const INBOUND_TRACEPARENT_MESSAGE = 'inbound trace context';

/** `<version>-<trace-id>-<parent-id>-<trace-flags>`, all lowercase hex. */
const TRACEPARENT = /^[\da-f]{2}-[\da-f]{32}-[\da-f]{16}-([\da-f]{2})$/;

/** Bit 0 of `trace-flags`: the sampled flag. */
const SAMPLED = 0b1;

/**
 * Opt-in, and read at wiring time rather than per request: an env change on
 * Cloud Run makes a new revision without an image build, so the diagnostic can
 * be switched on and off without two CI deploys.
 */
export function isInboundTraceparentLoggingEnabled(): boolean {
  return process.env[ENV.LOG_INBOUND_TRACEPARENT] === 'true';
}

/**
 * Node joins repeated headers, but a header can still arrive as an array —
 * take the first rather than stringifying a list into something unparseable.
 */
function headerValue(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

/**
 * `true`/`false` when the header parses, `null` when it is absent or
 * malformed — an unparseable header decides nothing, which is a different
 * fact from a header that says "do not sample".
 */
export function parseSampledFlag(traceparent: string | undefined): boolean | null {
  const flags = traceparent?.match(TRACEPARENT)?.[1];
  if (flags === undefined) return null;
  return (Number.parseInt(flags, 16) & SAMPLED) === SAMPLED;
}

/**
 * Fields for one request. Every request is logged while the flag is on,
 * including the ones carrying no trace context at all: the total is what gets
 * compared against Cloud Run's request count, and "no header" is itself an
 * answer.
 *
 * `traceparent` is safe to log under the JEF-348 rule — it holds a trace id, a
 * span id and two flag bits, and no user data.
 */
export function inboundTraceparentFields(headers: IncomingHttpHeaders): LogFields {
  const traceparent = headerValue(headers.traceparent);
  return {
    event: INBOUND_TRACEPARENT_EVENT,
    traceparent,
    // Parsed into its own field so Axiom can `summarize by` it without string
    // surgery.
    sampled: parseSampledFlag(traceparent),
    // Cloud Run injects this one too, with its own `;o=1` sampled suffix.
    hasCloudTraceContext: headerValue(headers['x-cloud-trace-context']) !== undefined,
  };
}
