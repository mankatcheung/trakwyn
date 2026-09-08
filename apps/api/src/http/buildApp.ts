import type { FastifyInstance } from 'fastify';
import { fastifyAwilixPlugin } from '@fastify/awilix';
import mercurius from 'mercurius';
import cookie from '@fastify/cookie';
import { asValue } from 'awilix';

import corsPlugin from '#src/http/adapters/fastify/corsPlugin.js';
import { registerRoutes } from '#src/http/adapters/fastify/registerRoutes.js';
import { toHttpRequest } from '#src/http/adapters/fastify/toHttpRequest.js';
import { toHttpResponse } from '#src/http/adapters/fastify/toHttpResponse.js';
import { buildGraphQLContext } from '#src/http/adapters/fastify/buildGraphQLContext.js';
import { diScopeOf } from '#src/http/adapters/fastify/diScope.js';
import { remindersRoutes } from '#src/http/routes/reminders.routes.js';
import { pushNotificationsRoutes } from '#src/http/routes/pushNotifications.routes.js';
import { digestRoutes } from '#src/http/routes/digest.routes.js';
import { trashPurgeRoutes } from '#src/http/routes/trashPurge.routes.js';
import { healthRoutes } from '#src/http/routes/health.routes.js';
import { mcpRoutes } from '#src/http/routes/mcp.routes.js';
import { handleChatStream } from '#src/http/routes/chatStream.routes.js';
import { oauthRoutes } from '#src/http/routes/oauth.routes.js';
import { fakeOAuthConsentRoutes } from '#src/http/routes/fakeOAuthConsent.routes.js';
import { fakeLlmCompletionsRoutes } from '#src/http/routes/fakeLlmCompletions.routes.js';
import { mcpOAuthMetadataRoutes } from '#src/http/routes/mcpOAuth.routes.js';
import { buildContainer } from '#src/http/container.js';
import { schema } from '#src/http/schema/index.js';
import { formatError } from '#src/http/errors/formatError.js';
import { PinoLogger } from '#src/infrastructure/observability/PinoLogger.js';
import {
  fastifyOtelInstrumentation,
  flushObservability,
  isObservabilityEnabled,
} from '#src/infrastructure/observability/tracing.js';
import {
  ENV,
  LLM_PROVIDER_MODE,
  NODE_ENV,
  OAUTH_PROVIDER_MODE,
  STORAGE_PROVIDER,
} from '#src/infrastructure/config/constants.js';
import { CHAT_STREAM, ROUTES } from '#src/http/constants.js';

/**
 * Fully configures an already-constructed Fastify instance (cors/cookie/
 * awilix/mercurius, all routes) without binding a port, and returns it.
 * Split out from `index.ts` so integration tests can get a real, fully-wired
 * app via `.inject()` without starting a real server — `index.ts` is reduced
 * to constructing the instance and calling this, then `.listen(...)`.
 *
 * Takes the instance as a parameter rather than constructing it here:
 * Vercel's zero-config Fastify build detection scans the entrypoint file
 * itself for a literal `import fastify` + constructor call to know how to
 * wrap the serverless function — moving that construction in here broke
 * preview deploys with "No entrypoint found which imports fastify" even
 * though `index.ts` still used Fastify transitively through this function.
 */
export async function buildApp(fastify: FastifyInstance): Promise<FastifyInstance> {
  if (isObservabilityEnabled) {
    await fastify.register(fastifyOtelInstrumentation.plugin());

    // Vercel freezes the function shortly after the response is sent, well
    // before the OTel SDK's default ~5s batch-export timer fires, so most
    // spans would never reach Axiom. Force-flush after every response while
    // the invocation is still alive. Runs after @fastify/otel's per-route
    // hooks have ended the request span (they're onSend-hook based), so the
    // flush captures complete spans.
    fastify.addHook('onResponse', () => flushObservability());
  }

  await fastify.register(corsPlugin);
  await fastify.register(cookie);
  if (process.env[ENV.STORAGE_PROVIDER] === STORAGE_PROVIDER.LOCAL) {
    fastify.addContentTypeParser(
      ['application/octet-stream', 'text/plain', 'application/pdf'],
      { parseAs: 'buffer' },
      (_request, body, done) => done(null, body),
    );
  }
  fastify.addContentTypeParser(
    'application/x-www-form-urlencoded',
    { parseAs: 'string' },
    (_request, body, done) => {
      done(null, Object.fromEntries(new URLSearchParams(String(body))));
    },
  );

  const container = buildContainer();
  // Shared with the errorFormatter below, not constructed twice — same
  // fastify.log instance either way, so a second PinoLogger would just be
  // redundant, not meaningfully different.
  const logger = new PinoLogger(fastify.log);
  container.register({ logger: asValue(logger) });

  await fastify.register(fastifyAwilixPlugin, {
    container,
    disposeOnClose: true,
    disposeOnResponse: true,
  });

  if (process.env[ENV.STORAGE_PROVIDER] === STORAGE_PROVIDER.LOCAL) {
    fastify.put<{ Params: { '*': string }; Body: Buffer }>(
      '/uploads/_upload/*',
      async (request, reply) => {
        const storageKey = decodeURIComponent(request.params['*']);
        if (
          !/^users\/[^/]+\/applications\/[^/]+\/[^/]+$/.test(storageKey) ||
          storageKey.includes('..')
        ) {
          return reply.code(400).send({ error: 'Invalid storage key' });
        }

        await container.cradle.storageProvider.putObject(
          storageKey,
          request.body,
          request.headers['content-type']?.split(';', 1)[0] ?? 'application/octet-stream',
        );
        return reply.code(204).send();
      },
    );
  }

  registerRoutes(fastify, [
    ...healthRoutes(),
    ...remindersRoutes(() => container.cradle),
    ...pushNotificationsRoutes(() => container.cradle),
    ...digestRoutes(() => container.cradle),
    ...trashPurgeRoutes(() => container.cradle),
    ...mcpOAuthMetadataRoutes(() => container.cradle),
    // Never present unless explicitly opted into — see FakeOAuthProvider.
    ...(process.env[ENV.OAUTH_PROVIDER_MODE] === OAUTH_PROVIDER_MODE.FAKE
      ? fakeOAuthConsentRoutes()
      : []),
    // Never present unless explicitly opted into — see fakeLlmCompletions.routes.ts.
    ...(process.env[ENV.LLM_PROVIDER_MODE] === LLM_PROVIDER_MODE.FAKE
      ? fakeLlmCompletionsRoutes()
      : []),
  ]);

  // Registered here rather than through registerRoutes because MCP resolves
  // its dependencies from a per-request DI scope. Every definition is wired,
  // not just the first: the GET/DELETE handlers exist to answer 405 rather
  // than let Fastify answer 404, and a hardcoded `[route]` would silently drop
  // them.
  for (const { method, path } of mcpRoutes(() => container.cradle)) {
    fastify.route({
      method,
      url: path,
      handler: async (request, reply) => {
        const route = mcpRoutes(() => diScopeOf(request).cradle).find((r) => r.method === method)!;
        await route.handler(toHttpRequest(request), toHttpResponse(reply));
      },
    });
  }
  // Registered directly (not through registerRoutes/RouteDefinition), same
  // as MCP above: handleChatStream writes to reply.raw incrementally and
  // needs the real FastifyRequest/FastifyReply, not the abstracted
  // IHttpRequest/IHttpResponse ports built for a single send().
  fastify.route({
    method: 'POST',
    url: ROUTES.CHAT_STREAM,
    bodyLimit: CHAT_STREAM.BODY_LIMIT_BYTES,
    handler: handleChatStream,
  });
  fastify.route({
    method: 'GET',
    url: ROUTES.OAUTH_START,
    handler: async (request, reply) => {
      const route = oauthRoutes(() => diScopeOf(request).cradle).find(
        (r) => r.path === ROUTES.OAUTH_START,
      )!;
      await route.handler(toHttpRequest(request), toHttpResponse(reply));
    },
  });
  fastify.route({
    method: 'GET',
    url: ROUTES.OAUTH_CALLBACK,
    handler: async (request, reply) => {
      const route = oauthRoutes(() => diScopeOf(request).cradle).find(
        (r) => r.path === ROUTES.OAUTH_CALLBACK,
      )!;
      await route.handler(toHttpRequest(request), toHttpResponse(reply));
    },
  });

  await fastify.register(mercurius, {
    schema,
    graphiql: process.env[ENV.NODE_ENV] !== NODE_ENV.PRODUCTION,
    errorFormatter: (result) => {
      // Not `result.errors?.map(formatError)` — formatError now takes a
      // second (logger) argument, and Array.prototype.map passes (value,
      // index, array) to its callback, so passed directly the array index
      // would land in that slot the same way `['1','2'].map(parseInt)`
      // famously misuses parseInt's radix parameter.
      const errors = result.errors?.map((err) => formatError(err, logger));
      return { statusCode: 200, response: { ...result, errors } };
    },
    context: buildGraphQLContext,
  });

  return fastify;
}
