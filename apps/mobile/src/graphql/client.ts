import { GraphQLClient, ClientError } from 'graphql-request';
import { ACCESS_TOKEN_REFRESH_LEEWAY_S, API_URL, ERROR_CODES } from '../constants';
import { getTokens, setTokens, clearTokens, type TokenPair } from '../auth/tokenStorage';
import { buildUserAgent } from '../lib/userAgent';
import {
  addBreadcrumb,
  captureException,
  isApiRequest,
  newTraceContext,
  rememberTraceId,
} from '../lib/analytics';

const REFRESH_TOKEN_MOBILE_MUTATION = `
  mutation RefreshTokenMobile($refreshToken: String!) {
    refreshTokenMobile(refreshToken: $refreshToken) {
      accessToken
      refreshToken
    }
  }
`;

type SessionExpiredListener = () => void;
let sessionExpiredListener: SessionExpiredListener | null = null;

/** AuthContext subscribes here to learn when the session is over for good (a rejected refresh token), so it can drop back to the auth stack. */
export function onSessionExpired(listener: SessionExpiredListener): () => void {
  sessionExpiredListener = listener;
  return () => {
    if (sessionExpiredListener === listener) sessionExpiredListener = null;
  };
}

let accessToken: string | null = null;

/** Kept in memory (not just secure storage) so every request can attach it synchronously without an async storage read per call. */
export function setAccessToken(token: string | null): void {
  accessToken = token;
}

/** The raw in-memory token. Prefer getValidAccessToken() for anything about to open a request. */
export function getAccessToken(): string | null {
  return accessToken;
}

/**
 * Reads `exp` from the JWT payload without verifying it — the server does
 * that; the client only needs to know whether a round-trip is worth making.
 * Anything unparseable counts as expiring, which routes it through a refresh.
 */
function expiresWithin(token: string, seconds: number): boolean {
  try {
    const [, payload = ''] = token.split('.');
    const claims = JSON.parse(atob(payload.replace(/-/g, '+').replace(/_/g, '/'))) as {
      exp?: unknown;
    };
    return typeof claims.exp !== 'number' || claims.exp * 1000 - Date.now() < seconds * 1000;
  } catch {
    return true;
  }
}

const userAgent = buildUserAgent();

/**
 * The `traceparent` header for a request to `url`, or nothing when `url`
 * is not the API's own origin (JEF-349).
 *
 * The origin check matters even though this client only ever talks to one
 * endpoint: the same helper is used by the chat SSE stream and by document
 * uploads, and a correlation id across a user's requests is not something
 * to hand to a third-party host by accident. The id is remembered here so
 * an exception captured moments later can name the request it followed.
 */
export function traceHeaders(url: string): Record<string, string> {
  if (!isApiRequest(url, API_URL)) return {};
  const { traceId, traceparent } = newTraceContext();
  rememberTraceId(traceId);
  return { traceparent };
}

const rawClient = new GraphQLClient(API_URL, {
  headers: userAgent ? { 'user-agent': userAgent } : undefined,
  requestMiddleware: (request) => ({
    ...request,
    headers: { ...request.headers, ...traceHeaders(request.url) },
  }),
});

type RefreshOutcome =
  | { status: 'refreshed'; tokens: TokenPair }
  /** The session is genuinely over: the server rejected the refresh token, or there is none to present. */
  | { status: 'rejected' }
  /** The request never landed. Says nothing about whether the token is still good. */
  | { status: 'unreachable' };

let refreshPromise: Promise<RefreshOutcome> | null = null;

async function endSession(): Promise<void> {
  await clearTokens().catch(() => {
    // The pair is being abandoned either way; a storage error must not stop
    // the rest of the app from hearing that the session is over.
    addBreadcrumb('Secure storage delete failed');
  });
  setAccessToken(null);
  sessionExpiredListener?.();
}

async function doRefresh(): Promise<RefreshOutcome> {
  let tokens: TokenPair | null;
  try {
    tokens = await getTokens();
  } catch {
    // A SecureStore read that throws is indistinguishable from having no
    // session, and is handled the same way — but it is a very different
    // thing to see in the trail behind a crash.
    addBreadcrumb('Secure storage read failed');
    tokens = null;
  }
  if (!tokens) {
    addBreadcrumb('Token refresh skipped: no stored session');
    return { status: 'rejected' };
  }

  let data: { refreshTokenMobile: TokenPair };
  try {
    data = await rawClient.request<{ refreshTokenMobile: TokenPair }>(
      REFRESH_TOKEN_MOBILE_MUTATION,
      { refreshToken: tokens.refreshToken },
    );
  } catch (error) {
    // Deleting a still-valid refresh token because the subway ate the request
    // costs the user the whole session — so only an actual rejection ends it.
    const rejected = isUnauthorized(error);
    addBreadcrumb(rejected ? 'Token refresh rejected' : 'Token refresh unreachable');
    if (rejected) {
      // A refresh the server actively rejected is the one outcome worth an
      // event: it signs the user out, and it is also what refresh-token reuse
      // detection looks like from this side. An unreachable server is an
      // ordinary bad network and stays a breadcrumb.
      captureException(error, { kind: 'token_refresh_rejected' });
    }
    return rejected ? { status: 'rejected' } : { status: 'unreachable' };
  }

  setAccessToken(data.refreshTokenMobile.accessToken);
  try {
    await setTokens(data.refreshTokenMobile);
  } catch (error) {
    // The server has already rotated. If the device cannot keep the new pair,
    // the old one on disk will be presented on the next launch and — past the
    // API's 10-second rotation grace — read as a stolen token: the session
    // gets revoked and an error logged. A deliberate sign-out is the better
    // outcome, so this reports the session as over.
    addBreadcrumb('Token refresh succeeded but the new pair could not be stored');
    captureException(error, { kind: 'token_storage_write_failed' });
    return { status: 'rejected' };
  }
  addBreadcrumb('Token refresh succeeded');
  return { status: 'refreshed', tokens: data.refreshTokenMobile };
}

/** Single-flights the refresh: concurrent callers share one refreshTokenMobile round-trip. */
function getOrStartRefresh(): Promise<RefreshOutcome> {
  refreshPromise ??= doRefresh().finally(() => {
    refreshPromise = null;
  });
  return refreshPromise;
}

/**
 * The token to attach to a request, refreshed first if it is about to lapse.
 * For callers that cannot recover from UNAUTHORIZED after the fact — the
 * chat SSE stream, whose 401 is a plain JSON body — and for a cold start,
 * whose restored token is almost always past its 15 minutes. Returns the
 * stale token when the refresh cannot reach the server, and null once the
 * session is over.
 */
export async function getValidAccessToken(): Promise<string | null> {
  if (!accessToken || !expiresWithin(accessToken, ACCESS_TOKEN_REFRESH_LEEWAY_S)) {
    return accessToken;
  }
  const outcome = await getOrStartRefresh();
  if (outcome.status === 'refreshed') return outcome.tokens.accessToken;
  if (outcome.status === 'rejected') {
    await endSession();
    return null;
  }
  return accessToken;
}

export type UnauthorizedRecovery =
  { kind: 'retry'; token: string } | { kind: 'ended' } | { kind: 'unreachable' };

/**
 * Shared recovery for a request that carried `sentWith` and came back
 * UNAUTHORIZED — gqlRequest and the chat SSE stream make the same decision:
 * retry with a fresh token, give up on the session, or report that the
 * refresh never reached the server.
 */
export async function recoverFromUnauthorized(sentWith: string): Promise<UnauthorizedRecovery> {
  // Another request already refreshed while this one was in flight — retry
  // with the token that is current now rather than rotate the session again.
  if (accessToken && accessToken !== sentWith) return { kind: 'retry', token: accessToken };

  const outcome = await getOrStartRefresh();
  if (outcome.status === 'refreshed') return { kind: 'retry', token: outcome.tokens.accessToken };
  if (outcome.status === 'rejected') {
    await endSession();
    return { kind: 'ended' };
  }
  return { kind: 'unreachable' };
}

export function isUnauthorized(error: unknown): boolean {
  if (!(error instanceof ClientError)) return false;
  return (
    error.response.errors?.some((e) => e.extensions?.code === ERROR_CODES.UNAUTHORIZED) ?? false
  );
}

function authHeaders(token: string | null): HeadersInit | undefined {
  return token ? { authorization: `Bearer ${token}` } : undefined;
}

/**
 * Every mobile screen goes through this instead of graphql-request directly:
 * it attaches the current access token and, when a request that carried one
 * comes back UNAUTHORIZED, refreshes once and retries — refreshTokenMobile
 * itself goes through the raw client so a failed refresh can't recurse back
 * into this same path.
 *
 * `refreshOnUnauthorized: false` is for mutations where UNAUTHORIZED is the
 * answer to the request rather than a statement about the token —
 * updatePassword and reauthenticateMobile reject a wrong password with the
 * same code, and replaying one would spend its rate limit twice. Those
 * requests get a proactively refreshed token instead, so an expired one is
 * still never mistaken for a wrong password. loginMobile and registerMobile
 * need no flag: they run without a token, and only a request that carried
 * one can have an expired one.
 */
export async function gqlRequest<T>(
  query: string,
  variables?: object,
  { refreshOnUnauthorized = true }: { refreshOnUnauthorized?: boolean } = {},
): Promise<T> {
  const sentWith = refreshOnUnauthorized ? accessToken : await getValidAccessToken();
  try {
    return await rawClient.request<T>(query, variables, authHeaders(sentWith));
  } catch (error) {
    if (!isUnauthorized(error) || !sentWith || !refreshOnUnauthorized) throw error;

    const recovery = await recoverFromUnauthorized(sentWith);
    if (recovery.kind !== 'retry') throw error;
    return rawClient.request<T>(query, variables, authHeaders(recovery.token));
  }
}
