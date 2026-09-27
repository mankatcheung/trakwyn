import type { IncomingMessage } from 'node:http';
import type { Attributes } from '@opentelemetry/api';
import { coldStartSpanAttributes } from '#src/infrastructure/observability/coldStart.js';
import { clientIdentitySpanAttributes } from '#src/infrastructure/observability/clientIdentity.js';

/**
 * The http instrumentation's `startIncomingSpanHook`: the attributes every
 * HTTP server span starts with. The instrumentation takes one hook, so this
 * merges the cold-start flag (coldStart.ts) with the mobile client's identity
 * (clientIdentity.ts). Neither reaches an outgoing client span.
 */
export function incomingSpanAttributes(
  request: Pick<IncomingMessage, 'url' | 'headers'>,
): Attributes {
  return {
    ...coldStartSpanAttributes(request),
    ...clientIdentitySpanAttributes(request),
  };
}
