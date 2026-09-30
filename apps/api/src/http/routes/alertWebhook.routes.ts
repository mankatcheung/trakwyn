import { createHash, timingSafeEqual } from 'node:crypto';

import type { Cradle } from '#src/http/container.js';
import type { IHttpRequest } from '#src/http/ports/IHttpRequest.js';
import type { RouteDefinition } from '#src/http/ports/RouteDefinition.js';
import { ALERT_WEBHOOK_EVENTS, ROUTES } from '#src/http/constants.js';
import { AUTH_HEADER, ENV } from '#src/infrastructure/config/constants.js';
import { parseAxiomWebhook } from '#src/interface-adapters/alerts/axiomAlertWebhook.js';

/** All three must be set, or there is nowhere to file an issue or no way to trust the caller. */
const REQUIRED_ENV = [ENV.ALERT_WEBHOOK_SECRET, ENV.LINEAR_API_KEY, ENV.LINEAR_TEAM_ID] as const;

export function isAlertWebhookConfigured(): boolean {
  return REQUIRED_ENV.every((key) => Boolean(process.env[key]));
}

/**
 * Compared as digests so the comparison is constant-time whatever the
 * lengths: `timingSafeEqual` throws on a length mismatch, which would itself
 * leak the secret's length.
 */
function hasValidSecret(request: IHttpRequest): boolean {
  const secret = process.env[ENV.ALERT_WEBHOOK_SECRET];
  const auth = request.headers.authorization;
  if (!secret || typeof auth !== 'string' || !auth.startsWith(AUTH_HEADER.BEARER_PREFIX)) {
    return false;
  }
  const digest = (value: string) => createHash('sha256').update(value).digest();
  return timingSafeEqual(digest(auth.slice(AUTH_HEADER.BEARER_PREFIX.length)), digest(secret));
}

/**
 * The Axiom → Linear relay (JEF-382). Axiom's custom webhook can't build a
 * Linear request itself — its template leaves monitor text unescaped — so it
 * posts a fixed shape here and `FileAlertIssueUseCase` does the rest.
 *
 * Authenticated by a bearer secret that `infra/axiom` puts in the notifier's
 * headers. Answers 202 for anything it accepted, filed or not, so Axiom does
 * not treat a deliberate skip (recovery, duplicate, rate limit) as a failed
 * delivery; 502 only when Linear itself failed.
 */
export function alertWebhookRoutes(getCradle: () => Cradle): RouteDefinition[] {
  return [
    {
      method: 'POST',
      path: ROUTES.AXIOM_ALERT_WEBHOOK,
      handler: async (req, res) => {
        const { logger } = getCradle();

        if (!isAlertWebhookConfigured()) {
          res.status(503).send({ error: 'Alert relay not configured' });
          return;
        }

        if (!hasValidSecret(req)) {
          logger.warn('Alert webhook rejected', undefined, {
            event: ALERT_WEBHOOK_EVENTS.REJECTED,
          });
          res.status(401).send({ error: 'Unauthorized' });
          return;
        }

        const parsed = parseAxiomWebhook(req.body);
        if (!parsed.ok) {
          // The issue paths name fields, not values: nothing from the body is logged.
          logger.warn('Alert webhook body invalid', undefined, {
            event: ALERT_WEBHOOK_EVENTS.INVALID,
            issues: parsed.issues.join('; '),
          });
          res.status(400).send({ error: 'Invalid alert payload', issues: parsed.issues });
          return;
        }

        const { fileAlertIssueUseCase } = getCradle();
        try {
          const result = await fileAlertIssueUseCase.execute(parsed.alert);
          const issue = 'issue' in result ? result.issue.identifier : null;
          logger.info('Alert webhook handled', {
            event: ALERT_WEBHOOK_EVENTS.HANDLED,
            outcome: result.outcome,
            fingerprint: parsed.alert.fingerprint,
            issue,
          });
          res.status(202).send({ outcome: result.outcome, issue });
        } catch (error) {
          logger.error('Alert webhook failed to file an issue', error, {
            event: ALERT_WEBHOOK_EVENTS.FAILED,
            fingerprint: parsed.alert.fingerprint,
          });
          res.status(502).send({ error: 'Issue tracker unavailable' });
        }
      },
    },
  ];
}
