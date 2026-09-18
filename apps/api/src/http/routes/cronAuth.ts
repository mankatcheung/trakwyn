import type { IHttpRequest } from '#src/http/ports/IHttpRequest.js';
import type { IOidcTokenVerifier } from '#src/use-cases/ports/IOidcTokenVerifier.js';
import { AUTH_HEADER, ENV } from '#src/infrastructure/config/constants.js';

/**
 * Shared auth check for the admin/cron-triggered routes (digest, reminders,
 * trash purge, push notifications). Accepts any of:
 *
 * - a Google-signed OIDC ID token for the `CRON_INVOKER_SA` service account,
 *   with `API_ORIGIN` as its audience — what the Cloud Scheduler jobs in
 *   infra/gcp/scheduler.tf send (JEF-336). No shared secret is involved, so
 *   nothing sensitive reaches Terraform state;
 * - the route's own dedicated secret, for manual/external triggering;
 * - CRON_SECRET, kept as the manual-trigger path for every route.
 */
export async function isAuthorizedCronTrigger(
  request: IHttpRequest,
  ownSecretEnvKey: string,
  oidcTokenVerifier: IOidcTokenVerifier,
): Promise<boolean> {
  const auth = request.headers.authorization;
  if (typeof auth !== 'string' || !auth.startsWith(AUTH_HEADER.BEARER_PREFIX)) return false;

  const token = auth.slice(AUTH_HEADER.BEARER_PREFIX.length);
  if (matchesSecret(token, ownSecretEnvKey) || matchesSecret(token, ENV.CRON_SECRET)) return true;

  return isScheduledInvoker(token, oidcTokenVerifier);
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
