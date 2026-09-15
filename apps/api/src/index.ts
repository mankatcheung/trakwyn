// Must be the first import: several DI registrations (e.g. the Redis client
// used by RedisCache/RedisRateLimiter) are constructed eagerly at
// module-load time when buildApp() below is imported, reading process.env
// as they go — dotenv/config's side effect has to run before any of that.
import 'dotenv/config';
import Fastify from 'fastify';
import { buildApp } from '#src/http/buildApp.js';
import { startObservability } from '#src/infrastructure/observability/tracing.js';
import { ENV, NODE_ENV } from '#src/infrastructure/config/constants.js';

startObservability();

const isProduction = process.env[ENV.NODE_ENV] === NODE_ENV.PRODUCTION;

const fastify = Fastify({
  logger: {
    level: isProduction ? 'warn' : 'info',
    // Raw NDJSON is what Axiom's OTel ingestion expects in production, but
    // it's unreadable in a dev terminal — every request/error is one dense
    // JSON line with no color and no formatted stack trace, so a genuine
    // error is easy to miss scrolling past. pino-pretty only reformats for
    // the local stream; nothing about what gets logged changes.
    transport: isProduction
      ? undefined
      : {
          target: 'pino-pretty',
          options: {
            colorize: true,
            translateTime: 'HH:MM:ss',
            ignore: 'pid,hostname',
          },
        },
  },
  // Render's proxy terminates TLS and forwards to this process over what
  // Node sees as a plain connection, setting X-Forwarded-Proto/-Host to
  // record the original request. Without trustProxy, Fastify's
  // request.protocol ignores those and falls back to the raw socket's
  // encryption state — always 'http' here — so oauth.routes.ts's
  // callbackUrl() built redirect_uri as http://api.trakwyn.com/... instead
  // of https://..., which GitHub/Google reject outright ("redirect_uri is
  // not associated with this application") since it must match the
  // registered callback URL exactly, scheme included.
  trustProxy: true,
});

await buildApp(fastify);

const port = Number(process.env[ENV.PORT] ?? 3001);

try {
  await fastify.listen({ port, host: '0.0.0.0' });
  console.log(`API server listening on http://localhost:${port}`);
  console.log(`GraphiQL available at http://localhost:${port}/graphiql`);
} catch (err) {
  fastify.log.error(err);
  process.exit(1);
}
