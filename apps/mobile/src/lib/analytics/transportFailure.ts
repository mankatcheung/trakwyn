/**
 * Which failed GraphQL requests the mobile app reports to PostHog
 * (JEF-370).
 *
 * Mirrored from apps/web/src/lib/analytics/transportFailure.ts so an API
 * outage looks the same from either client; the web app's
 * transportFailureParity.test.ts keeps the two copies identical below this
 * comment.
 */

/** The HTTP status a graphql-request failure carries, when it carries one at all. */
function statusOf(error: Error): number | undefined {
  const status = (error as { response?: { status?: unknown } }).response?.status;
  return typeof status === 'number' ? status : undefined;
}

export type TransportFailureProperties = {
  kind: 'graphql_request_failed';
  status?: number;
  network_error?: true;
  operation?: string;
};

/**
 * The properties to report a failed GraphQL request with, or `null` when it
 * is not worth reporting.
 *
 * Reported: the failures that say something is wrong with the deployment
 * rather than with the request — the API unreachable (no response, so no
 * status), or answering 5xx.
 *
 * Deliberately not reported: a 4xx, or a GraphQL error with a domain code —
 * NOT_FOUND, VALIDATION, a wrong password — which arrives with a non-5xx
 * status. Those are the API working correctly and would bury the real
 * faults under everyday noise.
 */
export function transportFailureProperties(
  error: unknown,
  operation: string | undefined,
): TransportFailureProperties | null {
  if (!(error instanceof Error)) return null;
  const status = statusOf(error);
  if (status !== undefined && status < 500) return null;
  return {
    kind: 'graphql_request_failed',
    ...(status === undefined ? { network_error: true } : { status }),
    ...(operation ? { operation } : {}),
  };
}
