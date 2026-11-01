import { SpanStatusCode } from '@opentelemetry/api';
import type { ReadableSpan, SpanProcessor } from '@opentelemetry/sdk-trace';

import { GRAPHQL_VALIDATION_ERROR_CODE } from '#src/http/constants.js';

const EXCEPTION_EVENT = 'exception';
const EXCEPTION_TYPE_ATTRIBUTE = 'exception.type';

type SpanEvent = ReadableSpan['events'][number];

function isValidationException(event: SpanEvent): boolean {
  return (
    event.name === EXCEPTION_EVENT &&
    event.attributes?.[EXCEPTION_TYPE_ATTRIBUTE] === GRAPHQL_VALIDATION_ERROR_CODE
  );
}

/**
 * Keeps a stale client's invalid GraphQL document from showing up as a
 * server exception in Axiom.
 *
 * `@fastify/otel` wraps the `/graphql` handler and records the rejection of
 * `reply.graphql` on the handler span, but Mercurius then answers that
 * rejection itself (`errorFormatter` → `formatValidationFailure`, JEF-472),
 * which logs it at `warn`, counts it per client and leaves the root span
 * `OK`. The handler span was already ended with an `exception` event and an
 * `ERROR` status by then. Both are dropped here, before any exporter sees
 * the span, so the only record of the request is the one JEF-472 chose.
 *
 * Must come first in `spanProcessors`: processors see the same span object
 * in order, and the batch processor only queues it.
 */
export class ClientErrorSpanFilter implements SpanProcessor {
  onStart(): void {}

  onEnd(span: ReadableSpan): void {
    if (!span.events.some(isValidationException)) return;
    // `events` and `status` are readonly in the types, but they are the live
    // span's own fields and this is the last point they can be changed.
    const mutable = span as { events: SpanEvent[]; status: ReadableSpan['status'] };
    mutable.events = span.events.filter((event) => !isValidationException(event));
    mutable.status = { code: SpanStatusCode.UNSET };
  }

  forceFlush(): Promise<void> {
    return Promise.resolve();
  }

  shutdown(): Promise<void> {
    return Promise.resolve();
  }
}
