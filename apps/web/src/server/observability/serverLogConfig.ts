/**
 * Where the web app's server-side error lines go (JEF-359).
 *
 * The Vercel function (SSR renders and server functions) writes to its own
 * `trakwyn-web` dataset, never the API's `AXIOM_DATASET`, so a web-server
 * line cannot be mistaken for an API one and the two can carry separate
 * ingest-only tokens.
 *
 * Deliberately **not** `VITE_`-prefixed: Vite inlines those into the client
 * bundle, and this token must stay on the server. It is read from
 * `process.env` at request time instead.
 */
export const SERVER_LOG_ENV = {
  TOKEN: 'AXIOM_WEB_TOKEN',
  DATASET: 'AXIOM_WEB_DATASET',
} as const;

/** The same EU edge deployment the API sends to (apps/api `AXIOM.API_URL`). */
export const AXIOM_INGEST_ORIGIN = 'https://eu-central-1.aws.edge.axiom.co';

/**
 * Upper bound on one ingest POST. The function is frozen once its response
 * is sent, so the send is awaited on the error path — this caps how long a
 * failing request can be held up by a slow Axiom.
 */
export const INGEST_TIMEOUT_MS = 2_000;

export const SERVICE_NAME = 'trakwyn-web';

export interface ServerLogConfig {
  ingestUrl: string;
  token: string;
}

/**
 * Export is production-only, like the API's (JEF-345): dev and test never
 * send, even with a token in `.env`. Returns `null` when disabled, which the
 * logger treats as "write to stdout only".
 */
export function readServerLogConfig(
  env: Readonly<Record<string, string | undefined>>,
): ServerLogConfig | null {
  const token = env[SERVER_LOG_ENV.TOKEN]?.trim();
  const dataset = env[SERVER_LOG_ENV.DATASET]?.trim();
  if (env.NODE_ENV !== 'production' || !token || !dataset) return null;
  return {
    ingestUrl: `${AXIOM_INGEST_ORIGIN}/v1/ingest/${encodeURIComponent(dataset)}`,
    token,
  };
}
