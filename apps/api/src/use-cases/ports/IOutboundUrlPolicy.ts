/**
 * What a user-supplied URL is about to be used for. The policy is stricter
 * for an LLM endpoint (every AI feature will keep POSTing there, with a
 * credential attached) than for a one-off job-posting fetch.
 */
export type OutboundUrlPurpose = 'llm-provider' | 'job-posting';

/**
 * Decides whether the API server may open a connection to a URL a user
 * typed in. Both places that take one — the custom LLM provider's base URL
 * and `parseJobDescription(url)` — hand it to `fetch` from inside the
 * server's own network, so without a policy an authenticated user can point
 * the server at cloud metadata endpoints, Redis, or its own admin routes and
 * read whatever comes back.
 *
 * Throws a `ValidationError` for a refused URL; resolves otherwise. Callers
 * check at save time (fast feedback in the settings form) and again right
 * before the request (a hostname can change what it resolves to between
 * the two).
 */
export interface IOutboundUrlPolicy {
  assertAllowed(url: string, purpose: OutboundUrlPurpose): Promise<void>;
}
