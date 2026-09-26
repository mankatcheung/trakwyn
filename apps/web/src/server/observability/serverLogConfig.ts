import { POSTHOG_EU_HOST } from '#/constants';

/**
 * Where the web app's server-side errors go (JEF-374, was Axiom in JEF-359).
 *
 * The Vercel function (SSR renders and server functions) reports to the same
 * PostHog project as the browser, as `$exception` events, so client and
 * server errors share one Error Tracking view. It reuses the client's
 * `VITE_POSTHOG_KEY`/`VITE_POSTHOG_HOST`: the `phc_` key is public by design
 * (it ships in the browser bundle and can only send events), so there is no
 * server-only secret to keep out of the bundle and no extra var to manage.
 */
export const SERVER_LOG_ENV = {
  KEY: 'VITE_POSTHOG_KEY',
  HOST: 'VITE_POSTHOG_HOST',
} as const;

/** PostHog's public capture endpoint, relative to the ingestion host. */
export const POSTHOG_CAPTURE_PATH = '/i/v0/e/';

/**
 * Upper bound on one capture POST. The function is frozen once its response
 * is sent, so the send is awaited on the error path — this caps how long a
 * failing request can be held up by a slow PostHog.
 */
export const INGEST_TIMEOUT_MS = 2_000;

export const SERVICE_NAME = 'trakwyn-web';

export interface ServerLogConfig {
  captureUrl: string;
  apiKey: string;
}

/**
 * Export is production-only, like the API's (JEF-345): dev and test never
 * send, even with a key in `.env`. Returns `null` when disabled, which the
 * logger treats as "write to stdout only".
 */
export function readServerLogConfig(
  env: Readonly<Record<string, string | undefined>>,
): ServerLogConfig | null {
  const apiKey = env[SERVER_LOG_ENV.KEY]?.trim();
  if (env.NODE_ENV !== 'production' || !apiKey) return null;
  const host = env[SERVER_LOG_ENV.HOST]?.trim() || POSTHOG_EU_HOST;
  try {
    return { captureUrl: new URL(POSTHOG_CAPTURE_PATH, host).toString(), apiKey };
  } catch {
    // A malformed host must not throw on the error path it exists to report.
    return null;
  }
}
