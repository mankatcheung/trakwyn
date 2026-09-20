import type { IHttpRequest } from '#src/http/ports/IHttpRequest.js';
import type { IOidcTokenVerifier } from '#src/use-cases/ports/IOidcTokenVerifier.js';
import { AUTH_HEADER, ENV } from '#src/infrastructure/config/constants.js';

/**
 * Which of the two paths let a request in. Reported rather than discarded
 * because a production run that authenticated by shared secret means something
 * — Cloud Scheduler sends an OIDC token, so `secret` in production is either a
 * manual trigger or the scheduler's identity no longer verifying (JEF-352).
 */
export type CronAuthMethod = 'oidc' | 'secret';

/**
 * Shared auth check for the admin/cron-triggered routes (digest, reminders,
 * trash purge, push notifications). Returns how the caller was authorized, or
 * null if it was not. Accepts any of:
 *
 * - a Google-signed OIDC ID token for the `CRON_INVOKER_SA` service account,
 *   with `API_ORIGIN` as its audience — what the Cloud Scheduler jobs in
 *   infra/gcp/scheduler.tf send (JEF-336). No shared secret is involved, so
 *   nothing sensitive reaches Terraform state;
 * - the route's own dedicated secret, for manual/external triggering;
 * - CRON_SECRET, kept as the manual-trigger path for every route.
 */
export async function authorizeCronTrigger(
  request: IHttpRequest,
  ownSecretEnvKey: string,
  oidcTokenVerifier: IOidcTokenVerifier,
): Promise<CronAuthMethod | null> {
  const auth = request.headers.authorization;
  if (typeof auth !== 'string' || !auth.startsWith(AUTH_HEADER.BEARER_PREFIX)) return null;

  const token = auth.slice(AUTH_HEADER.BEARER_PREFIX.length);
  if (matchesSecret(token, ownSecretEnvKey) || matchesSecret(token, ENV.CRON_SECRET)) {
    return 'secret';
  }

  return (await isScheduledInvoker(token, oidcTokenVerifier)) ? 'oidc' : null;
}

/**
 * Whether any way of authorizing the route is configured. A route with none
 * answers 503 rather than a 401 no request could ever get past.
 */
export function isCronTriggerConfigured(ownSecretEnvKey: string): boolean {
  return Boolean(
    process.env[ownSecretEnvKey] || process.env[ENV.CRON_SECRET] || oidcInvokerConfig(),
  );
}

function matchesSecret(token: string, envKey: string): boolean {
  const secret = process.env[envKey];
  return Boolean(secret) && token === secret;
}

function oidcInvokerConfig(): { invoker: string; audience: string } | null {
  const invoker = process.env[ENV.CRON_INVOKER_SA];
  const audience = process.env[ENV.API_ORIGIN];
  return invoker && audience ? { invoker, audience } : null;
}

async function isScheduledInvoker(
  token: string,
  oidcTokenVerifier: IOidcTokenVerifier,
): Promise<boolean> {
  const config = oidcInvokerConfig();
  if (!config) return false;

  const identity = await oidcTokenVerifier.verify(token, config.audience);
  return identity?.email === config.invoker;
}
