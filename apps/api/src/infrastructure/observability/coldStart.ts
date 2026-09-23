import type { IncomingMessage } from 'node:http';
import type { Attributes } from '@opentelemetry/api';
import { ATTR_FAAS_COLDSTART } from '@opentelemetry/semantic-conventions/incubating';
import { TRACING } from '#src/infrastructure/config/constants.js';

let coldStartPending = true;

/**
 * True exactly once per process — for the first caller — and false for
 * every call after it. The flag is module-level on purpose: a process is
 * cold for one request, however many it goes on to serve.
 */
export function takeColdStart(): boolean {
  const coldStart = coldStartPending;
  coldStartPending = false;
  return coldStart;
}

/** Re-arms {@link takeColdStart}. Tests only. */
export function resetColdStartForTesting(): void {
  coldStartPending = true;
}

function pathOf(url: string | undefined): string | undefined {
  return url?.split('?', 1)[0];
}

/**
 * The http instrumentation's `startIncomingSpanHook` (JEF-357): marks the
 * HTTP server span of the first request each process serves with
 * `faas.coldstart=true` and the process uptime at that moment, and every
 * later one with `faas.coldstart=false`.
 *
 * The API scales to zero on Cloud Run, so a slow request in Axiom is either
 * slow code or a request that waited for a container to boot; this is what
 * tells the two apart. The instrumentation calls this hook for incoming
 * requests only — outgoing client spans have a hook of their own — so no call
 * the API makes to Postgres, Redis or an LLM provider carries the flag.
 *
 * Cloud Run's startup probe is always a new instance's first request, and no
 * user waits on it, so it gets no attribute and leaves the flag for the
 * first request that someone did wait on.
 */
export function coldStartSpanAttributes(
  request: Pick<IncomingMessage, 'url'>,
  uptimeSeconds: () => number = process.uptime,
): Attributes {
  if (pathOf(request.url) === TRACING.STARTUP_PROBE_PATH) return {};

  if (!takeColdStart()) return { [ATTR_FAAS_COLDSTART]: false };

  return {
    [ATTR_FAAS_COLDSTART]: true,
    [TRACING.PROCESS_UPTIME_ATTRIBUTE]: Math.round(uptimeSeconds() * 1000),
  };
}
