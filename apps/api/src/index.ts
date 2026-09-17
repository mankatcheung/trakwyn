// Must be the first import: several DI registrations (e.g. the Redis client
// used by RedisCache/RedisRateLimiter) are constructed eagerly at
// module-load time when buildApp() below is imported, reading process.env
// as they go — dotenv/config's side effect has to run before any of that.
import 'dotenv/config';
import Fastify from 'fastify';
import { logs } from '@opentelemetry/api-logs';
import { buildApp } from '#src/http/buildApp.js';
import { SHUTDOWN } from '#src/http/constants.js';
import { createShutdownHandler } from '#src/http/gracefulShutdown.js';
import {
  shutdownObservability,
  startObservability,
} from '#src/infrastructure/observability/tracing.js';
import { createOtelLogDestination } from '#src/infrastructure/observability/otelLogDestination.js';
import { AXIOM, ENV, NODE_ENV } from '#src/infrastructure/config/constants.js';

startObservability();

const isProduction = process.env[ENV.NODE_ENV] === NODE_ENV.PRODUCTION;

const fastify = Fastify({
  logger: isProduction
    ? {
        level: 'warn',
        // Raw NDJSON on stdout (which Cloud Logging collects) and the same
        // lines as OTel log records for Axiom — see otelLogDestination.ts.
        stream: createOtelLogDestination({
          stdout: process.stdout,
          logger: logs.getLogger(AXIOM.SERVICE_NAME),
        }),
      }
    : {
        level: 'info',
        // Raw NDJSON is unreadable in a dev terminal — every request/error is
        // one dense JSON line with no color and no formatted stack trace, so a
        // genuine error is easy to miss scrolling past. pino-pretty only
        // reformats for the local stream; nothing about what gets logged
        // changes.
        transport: {
          target: 'pino-pretty',
          options: {
            colorize: true,
            translateTime: 'HH:MM:ss',
            ignore: 'pid,hostname',
          },
        },
      },
  // Cloud Run's front end terminates TLS and forwards to this container over
  // what Node sees as a plain connection, setting X-Forwarded-Proto to record
  // the original request. Without trustProxy, Fastify's request.protocol
  // ignores it and falls back to the raw socket's encryption state — always
  // 'http' here — so oauth.routes.ts's callbackUrl() would build redirect_uri
  // as http://api.trakwyn.com/... instead of https://..., which GitHub/Google
  // reject outright ("redirect_uri is not associated with this application")
  // since it must match the registered callback URL exactly, scheme included.
  trustProxy: true,
});

await buildApp(fastify);

const shutdown = createShutdownHandler({
  closeServer: () => fastify.close(),
  shutdownTelemetry: shutdownObservability,
  exit: (code) => process.exit(code),
  logError: (err) => fastify.log.error(err),
  closeTimeoutMs: SHUTDOWN.SERVER_CLOSE_TIMEOUT_MS,
});
process.once('SIGTERM', shutdown);
process.once('SIGINT', shutdown);

// Cloud Run injects PORT (8080); 3001 is the local default.
const port = Number(process.env[ENV.PORT] ?? 3001);

try {
  await fastify.listen({ port, host: '0.0.0.0' });
  console.log(`API server listening on http://localhost:${port}`);
  console.log(`GraphiQL available at http://localhost:${port}/graphiql`);
} catch (err) {
  fastify.log.error(err);
  await shutdownObservability();
  process.exit(1);
}
