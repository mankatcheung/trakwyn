import Fastify from 'fastify';
import { fastifyAwilixPlugin } from '@fastify/awilix';
import mercurius from 'mercurius';
import cookie from '@fastify/cookie';
import fastifyStatic from '@fastify/static';
import { join } from 'path';

import corsPlugin from '#src/http/adapters/fastify/corsPlugin.js';
import { registerRoutes } from '#src/http/adapters/fastify/registerRoutes.js';
import { toHttpRequest } from '#src/http/adapters/fastify/toHttpRequest.js';
import { toHttpResponse } from '#src/http/adapters/fastify/toHttpResponse.js';
import { buildGraphQLContext } from '#src/http/adapters/fastify/buildGraphQLContext.js';
import { diScopeOf } from '#src/http/adapters/fastify/diScope.js';
import { remindersRoutes } from '#src/http/routes/reminders.routes.js';
import { digestRoutes } from '#src/http/routes/digest.routes.js';
import { healthRoutes } from '#src/http/routes/health.routes.js';
import { mcpRoutes } from '#src/http/routes/mcp.routes.js';
import { oauthRoutes } from '#src/http/routes/oauth.routes.js';
import { registerUploadRoutes } from '#src/http/routes/uploads.routes.js';
import { buildContainer } from '#src/http/container.js';
import { schema } from '#src/http/schema/index.js';
import { formatError } from '#src/http/errors/formatError.js';
import { PinoLogger } from '#src/infrastructure/observability/PinoLogger.js';
import {
  fastifyOtelInstrumentation,
  isObservabilityEnabled,
} from '#src/infrastructure/observability/tracing.js';
import { asValue } from 'awilix';
import { ENV, NODE_ENV, ROUTES } from '#src/constants.js';

const isOfflineMode = process.env[ENV.OFFLINE_MODE] === 'true';

// startObservability();

const fastify = Fastify({
  logger: {
    level: process.env[ENV.NODE_ENV] === NODE_ENV.PRODUCTION ? 'warn' : 'info',
  },
});

if (isObservabilityEnabled) {
  await fastify.register(fastifyOtelInstrumentation.plugin());
}

await fastify.register(corsPlugin);
await fastify.register(cookie);

const container = buildContainer();
container.register({ logger: asValue(new PinoLogger(fastify.log)) });

await fastify.register(fastifyAwilixPlugin, {
  container,
  disposeOnClose: true,
  disposeOnResponse: true,
});

registerRoutes(fastify, [
  ...healthRoutes(),
  ...remindersRoutes(() => container.cradle),
  ...digestRoutes(() => container.cradle),
]);

fastify.route({
  method: 'POST',
  url: ROUTES.MCP,
  handler: async (request, reply) => {
    const [route] = mcpRoutes(() => diScopeOf(request).cradle);
    await route.handler(toHttpRequest(request), toHttpResponse(reply));
  },
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

// Register upload routes for local file storage
await fastify.register(registerUploadRoutes);

await fastify.register(mercurius, {
  schema,
  graphiql: !isOfflineMode && process.env[ENV.NODE_ENV] !== NODE_ENV.PRODUCTION,
  errorFormatter: (result) => {
    const errors = result.errors?.map(formatError);
    return { statusCode: 200, response: { ...result, errors } };
  },
  context: buildGraphQLContext,
});

// In offline mode, serve the web app as static files
if (isOfflineMode) {
  const webDistPath = join(import.meta.dirname, '..', 'web', 'dist');
  await fastify.register(fastifyStatic, {
    root: webDistPath,
    prefix: '/',
    wildcard: false,
  });

  // SPA fallback: serve index.html for any non-API route
  fastify.setNotFoundHandler((request, reply) => {
    if (request.url.startsWith('/graphql') || request.url.startsWith('/uploads')) {
      return reply.code(404).send({ error: 'Not found' });
    }
    return reply.sendFile('index.html');
  });
}

const port = Number(process.env[ENV.PORT] ?? 3001);

// Callback form, deliberately NOT `await`ed. Vercel's launcher imports this
// module and intercepts `listen()` to capture the server rather than truly
// binding it, so Fastify's ready callback never fires under that runtime.
// Awaiting it at the top level leaves the module permanently unresolved and
// every request hangs with no response on any path. This matches Vercel's
// documented Fastify entrypoint, which calls `listen()` as a bare statement.
fastify.listen({ port, host: '0.0.0.0' }, (err) => {
  if (err) {
    fastify.log.error(err);
    process.exit(1);
  }
  console.log(`API server listening on http://localhost:${port}`);
  if (!isOfflineMode) {
    console.log(`GraphiQL available at http://localhost:${port}/graphiql`);
  }
});
