import type { IHttpRequest } from '#src/http/ports/IHttpRequest.js';
import { AUTH_HEADER, ENV } from '#src/infrastructure/config/constants.js';

/**
 * Shared auth check for the admin/cron-triggered routes (digest, reminders,
 * trash purge, push notifications). Accepts either the route's own
 * dedicated secret (for manual/external triggering) or CRON_SECRET — the
 * shared secret Render's Cron Job resources (see render.yaml) send
 * as `Authorization: Bearer $CRON_SECRET` via a curl command, mirroring how
 * Vercel Cron used to auto-inject the same header.
 */
export function isAuthorizedCronTrigger(request: IHttpRequest, ownSecretEnvKey: string): boolean {
  const auth = request.headers.authorization;
  if (typeof auth !== 'string' || !auth.startsWith(AUTH_HEADER.BEARER_PREFIX)) return false;

  const token = auth.slice(AUTH_HEADER.BEARER_PREFIX.length);
  const ownSecret = process.env[ownSecretEnvKey];
  const cronSecret = process.env[ENV.CRON_SECRET];

  return (
    (Boolean(ownSecret) && token === ownSecret) || (Boolean(cronSecret) && token === cronSecret)
  );
}
