/**
 * Request parsing, validation and redirect building for the MCP OAuth routes.
 *
 * Split out of `mcpOAuth.routes.ts` (JEF-255), which was 482 lines: a ~255-line
 * route table followed by these fourteen module-private helpers. Separating
 * them leaves the route table readable end to end, and makes the helpers —
 * where the parameter validation and redirect construction actually live —
 * reachable from a test without going through a route.
 */

import { COOKIES } from '#src/http/constants.js';
import type { Cradle } from '#src/http/container.js';
import { ENV } from '#src/infrastructure/config/constants.js';
import type { IHttpRequest } from '#src/http/ports/IHttpRequest.js';
import type { IHttpResponse } from '#src/http/ports/IHttpResponse.js';
import type { McpConsentSubject } from '#src/infrastructure/auth/McpOAuthConsentService.js';
import type { McpOAuthScope } from '#src/domain/mcpOAuth/McpOAuthAccessToken.js';
import type { SecurityEventType } from '#src/domain/securityEvent/SecurityEvent.js';

/**
 * The issuer this authorization server advertises.
 *
 * Deliberately not derived from the request's Host header: discovery metadata
 * names the endpoints a client will send credentials to, so letting a caller
 * choose the host means letting it point clients elsewhere. Falls back to the
 * request origin only when unconfigured, which is the local-dev case.
 */
export function issuerOrigin(request: IHttpRequest): string {
  const configured = process.env[ENV.API_ORIGIN]?.trim();
  if (configured) return configured.replace(/\/+$/, '');
  const host = request.headers.host;
  const normalizedHost = Array.isArray(host) ? host[0] : host;
  return `${request.protocol}://${normalizedHost ?? 'localhost:3001'}`;
}

export interface AuthorizationRequest {
  clientId: string;
  redirectUri: string;
  responseType: string;
  /**
   * The effective scope, already resolved from the space-delimited request.
   * Null when the request named something we do not offer.
   */
  scope: McpOAuthScope | null;
  codeChallenge: string;
  codeChallengeMethod: string;
  state?: string;
}

export function authorizationRequest(
  input: IHttpRequest | Record<string, unknown>,
): AuthorizationRequest {
  const value = (key: string): string => {
    if ('query' in input) {
      return stringValue((input as IHttpRequest).query[key]);
    }
    return stringValue(input[key]);
  };
  return {
    clientId: value('client_id'),
    redirectUri: value('redirect_uri'),
    responseType: value('response_type'),
    scope: resolveScope(value('scope')),
    codeChallenge: value('code_challenge'),
    codeChallengeMethod: value('code_challenge_method'),
    state: value('state') || undefined,
  };
}

/**
 * `scope` is a space-delimited list (RFC 6749 s3.3), not a single value, and a
 * client that reads our `scopes_supported` is entitled to ask for everything
 * in it — `mcp-remote` and Claude's connector both request "read full".
 *
 * Ours are privilege levels rather than independent capabilities, so a request
 * naming both resolves to the higher one: asking for read *and* full is asking
 * for full. The granted scope is what the consent screen displays and what the
 * token response echoes back, so the user sees what they are approving and the
 * client learns what it actually got.
 *
 * Returns null for an empty list or any scope we do not offer, which the
 * caller reports as `invalid_scope`.
 */
export function resolveScope(requested: string): McpOAuthScope | null {
  const names = requested.split(/\s+/).filter(Boolean);
  if (names.length === 0) return null;
  if (names.some((name) => name !== 'read' && name !== 'full')) return null;
  return names.includes('full') ? 'full' : 'read';
}

export function consentSubject(
  userId: string,
  request: AuthorizationRequest,
  scope: McpOAuthScope,
): McpConsentSubject {
  return {
    userId,
    clientId: request.clientId,
    redirectUri: request.redirectUri,
    scope,
    codeChallenge: request.codeChallenge,
  };
}

/**
 * Either the request is good and carries the client plus the scope actually
 * granted, or it failed. A discriminated result rather than optional fields,
 * so a caller cannot read the scope without having checked for the error.
 */
export type AuthorizationValidation =
  | { ok: true; client: { name: string; redirectUris: string[] }; scope: McpOAuthScope }
  | {
      ok: false;
      error: string;
      /** Whether the error may be reported to redirect_uri rather than inline. */
      redirectable?: boolean;
    };

export async function validateAuthorizationRequest(
  cradle: Cradle,
  request: AuthorizationRequest,
): Promise<AuthorizationValidation> {
  if (!request.clientId || !request.redirectUri) {
    return { ok: false, error: 'invalid_request' };
  }

  const client = await cradle.mcpOAuthClientRepository.findById(request.clientId);
  if (!client || client.revokedAt || !client.redirectUris.includes(request.redirectUri)) {
    return { ok: false, error: 'invalid_client' };
  }

  // Past this point the redirect target is a URI this client registered, so
  // errors can safely be handed back to it.
  if (request.responseType !== 'code') {
    return { ok: false, error: 'unsupported_response_type', redirectable: true };
  }
  if (!request.codeChallenge || request.codeChallengeMethod !== 'S256') {
    return { ok: false, error: 'invalid_request', redirectable: true };
  }
  if (!request.scope) {
    return { ok: false, error: 'invalid_scope', redirectable: true };
  }
  return { ok: true, client, scope: request.scope };
}

/**
 * The consent endpoints are browser-only and only ever called by the Trakwyn
 * web app, so an exact Origin match is both possible and the load-bearing CSRF
 * defence here. It cannot be left to the global CORS policy: that one also
 * allows every `*.vercel.app` and every `chrome-extension://` origin with
 * credentials, which is fine for the API at large and not fine for an endpoint
 * whose response body carries an authorization code.
 */
export function sameSiteAsWebApp(
  cradle: Cradle,
  request: IHttpRequest,
  response: IHttpResponse,
): boolean {
  const origin = request.headers.origin;
  const normalized = Array.isArray(origin) ? origin[0] : origin;
  if (normalized && normalized === cradle.webAppOrigin) return true;
  response.status(403).send({ error: 'invalid_request' });
  return false;
}

/**
 * The signed-in user, or null. Goes through AuthenticateRequestUseCase rather
 * than verifying the JWT directly so that a session revoked by logout, "sign
 * out other sessions", a password reset, or refresh-token reuse cannot still
 * authorize a client (JEF-164). Without it a 15-minute window on a dead
 * session buys a 30-day refresh token.
 */
export async function authenticatedUserId(
  cradle: Cradle,
  request: IHttpRequest,
): Promise<string | null> {
  const accessToken = request.cookies[COOKIES.ACCESS_TOKEN];
  if (!accessToken) return null;
  const result = await cradle.authenticateRequestUseCase.execute(accessToken);
  return result?.sub ?? null;
}

export function buildCodeRedirect(request: AuthorizationRequest, code: string): string {
  const url = new URL(request.redirectUri);
  url.searchParams.set('code', code);
  if (request.state) url.searchParams.set('state', request.state);
  return url.toString();
}

export function buildErrorRedirect(request: AuthorizationRequest, error: string): string {
  const url = new URL(request.redirectUri);
  url.searchParams.set('error', error);
  if (request.state) url.searchParams.set('state', request.state);
  return url.toString();
}

/** RFC 6749 s5.1 — credentials must never be cached. */
export function noStore(response: IHttpResponse): IHttpResponse {
  return response.header('Cache-Control', 'no-store').header('Pragma', 'no-cache');
}

export function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

export function stringValue(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

export async function allowRequest(
  limiter: Cradle['mcpOAuthTokenRateLimiter'],
  request: IHttpRequest,
  response: IHttpResponse,
  suffix = '',
): Promise<boolean> {
  // `<route>:<subject category>:<value…>` — the category comes before
  // anything variable so a rejection can be logged as "an IP was limited on
  // mcp-oauth" without the address reaching the log (JEF-350). `suffix` is
  // the client id on /authorize, i.e. user-supplied, so it stays behind the
  // category too; it partitions buckets exactly as it did before.
  const subject = request.ip ?? request.headers['user-agent'] ?? 'unknown';
  const key = `mcp-oauth:ip:${subject}:${suffix}`;
  if (await limiter.consume(key)) return true;
  response.status(429).send({ error: 'rate_limited' });
  return false;
}

export async function recordSecurityEvent(
  cradle: Cradle,
  userId: string | undefined,
  eventType: SecurityEventType,
  request: IHttpRequest,
): Promise<void> {
  if (!userId) return;
  await cradle.securityEventRepository.create({
    id: cradle.generateId(),
    userId,
    eventType,
    ipAddress: request.ip,
    userAgent: stringValue(request.headers['user-agent']) || null,
  });
}
