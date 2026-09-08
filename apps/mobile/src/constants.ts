// iOS Simulator and Android Emulator can both reach the host machine's own
// localhost, but a physical device on the same network cannot — point
// EXPO_PUBLIC_API_URL at the machine's LAN IP (e.g. http://192.168.1.20:3001/graphql)
// when testing on a real device.
export const DEFAULT_API_URL = 'http://localhost:3001/graphql';

export const API_URL = process.env.EXPO_PUBLIC_API_URL ?? DEFAULT_API_URL;

/** Sibling of the GraphQL endpoint for the chat streaming SSE route (mirrors apps/web's CHAT_STREAM_URL) — not itself a GraphQL endpoint. */
export const CHAT_STREAM_URL = API_URL.replace(/\/graphql$/, '/chat/stream');

/** The API's own origin, with no path — used to build the OAuth start URL (apps/api's /auth/oauth/:provider/start). */
export const API_ORIGIN = API_URL.replace(/\/graphql$/, '');

/**
 * The app's own custom URL scheme (app.json's `scheme`), matching
 * apps/api's `MOBILE_OAUTH_CALLBACK` — where the OAuth callback redirects
 * once a mobile login finishes.
 */
export const OAUTH_MOBILE_CALLBACK_URL = 'trakwyn://oauth-callback';

/**
 * Longest chat message the API accepts (`CHAT.MAX_MESSAGE_CHARS` in
 * apps/api). Mirrored so the composer stops at the limit rather than
 * letting the user learn it from a 400.
 */
export const CHAT_MESSAGE_MAX_CHARS = 8000;

export const ERROR_CODES = {
  UNAUTHORIZED: 'UNAUTHORIZED',
  VALIDATION: 'VALIDATION',
  /** A TOTP-enabled account's session is too old for a sensitive change; the API wants a fresh reauthentication first (JEF-44). */
  STEP_UP_REQUIRED: 'STEP_UP_REQUIRED',
  /** Client-side only: the request never reached the server. */
  NETWORK_ERROR: 'NETWORK_ERROR',
} as const;

/**
 * An access token this close to its `exp` is refreshed before being used
 * rather than after the API rejects it — wide enough to absorb clock skew
 * and the request's own travel time.
 */
export const ACCESS_TOKEN_REFRESH_LEEWAY_S = 30;

/**
 * How long a cold start waits for a proactive refresh of the restored (and
 * by then almost always expired) access token before showing the app anyway.
 * Bounded so a flaky network delays launch by at most this much; past it the
 * first queries simply 401 and join the same in-flight refresh.
 */
export const RESTORE_REFRESH_WAIT_MS = 3000;
