import type { FastifyInstance } from 'fastify';
import type { Cradle } from '#src/http/container.js';
import { ROUTES } from '#src/http/constants.js';
import { BILLING_ADAPTER } from '#src/infrastructure/config/constants.js';
import { UnauthorizedError } from '#src/use-cases/errors/DomainError.js';

/**
 * The payment provider's webhook (JEF-426). The signature is computed over the
 * exact bytes sent, so the route lives in its own plugin scope with a parser
 * that hands the body over untouched; the app-wide JSON parser would re-encode
 * it. A bad signature is a 401. Any other failure is a 500, so the provider
 * redelivers: the event is recorded in the same transaction as the plan change,
 * which makes the retry safe.
 */
export function registerBillingWebhookRoute(
  fastify: FastifyInstance,
  getCradle: () => Cradle,
): void {
  void fastify.register(async (scope) => {
    scope.removeAllContentTypeParsers();
    scope.addContentTypeParser('*', { parseAs: 'buffer' }, (_request, body, done) =>
      done(null, body),
    );

    scope.post(
      ROUTES.BILLING_WEBHOOK,
      { bodyLimit: BILLING_ADAPTER.WEBHOOK_BODY_LIMIT_BYTES },
      async (request, reply) => {
        const rawBody = request.body;
        if (!Buffer.isBuffer(rawBody)) return reply.code(400).send({ error: 'Empty body' });

        try {
          const outcome = await getCradle().handleBillingWebhookUseCase.execute({
            rawBody,
            headers: request.headers,
          });
          return reply.send({ ok: true, outcome });
        } catch (err) {
          if (err instanceof UnauthorizedError) {
            return reply.code(401).send({ error: 'Invalid signature' });
          }
          throw err;
        }
      },
    );
  });
}
