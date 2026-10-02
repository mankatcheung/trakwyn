import { HTTP_SERVER_ERROR_MIN } from '../../constants';

/**
 * Which failed GraphQL requests the Clipper reports (JEF-387). The same rule
 * as apps/web/src/lib/analytics/transportFailure.ts, so an API outage looks
 * the same from every client. It is not a copy: the extension calls `fetch`
 * itself, so it has the status in hand rather than on a thrown error.
 */

export interface TransportFailureProperties {
  status?: number;
  network_error?: true;
  operation: string;
  trace_id: string;
}

const OPERATION_NAME = /\b(?:query|mutation|subscription)\s+([_A-Za-z][_0-9A-Za-z]*)/;

/**
 * The operation's declared name (`Me` for `query Me { … }`), or `anonymous`.
 * Only the name, a fixed identifier from the extension's own source, is ever
 * reported. The variables never are.
 */
export function operationName(query: string): string {
  return OPERATION_NAME.exec(query)?.[1] ?? 'anonymous';
}

/**
 * The properties to report a failed request with, or `null` when it is not
 * worth reporting.
 *
 * Reported: the API unreachable (no response, so `status` is `null`) or
 * answering 5xx. Not reported: a 4xx, or a GraphQL error with a domain code
 * such as a wrong password. Those are the API working correctly.
 */
export function transportFailureProperties(
  status: number | null,
  operation: string,
  traceId: string,
): TransportFailureProperties | null {
  // `>=` rather than `<`, so anything that is not a 5xx is left out.
  if (status !== null && !(status >= HTTP_SERVER_ERROR_MIN)) return null;
  return {
    ...(status === null ? { network_error: true as const } : { status }),
    operation,
    trace_id: traceId,
  };
}
