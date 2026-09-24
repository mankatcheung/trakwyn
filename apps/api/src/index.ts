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
import { shutdownObservability } from '#src/infrastructure/observability/tracing.js';
import { createOtelLogDestination } from '#src/infrastructure/observability/otelLogDestination.js';
import { serializeLoggedErrorForPino } from '#src/infrastructure/observability/serializeLoggedError.js';
import { AXIOM, ENV, NODE_ENV } from '#src/infrastructure/config/constants.js';

const isProduction = process.env[ENV.NODE_ENV] === NODE_ENV.PRODUCTION;

// Replaces pino's default error serializer, which keeps every enumerable
// property an error carries — for a failed Drizzle query that is the bound
// parameters, i.e. the user data the query was looking up (JEF-348). Set on
// the logger rather than on the destination so both copies of a line, the
// OTLP one and the stdout one Cloud Logging collects, are serialized once.
// PinoLogger applies the same function, for anything not logged through
// Fastify's own logger.
const serializers = { err: serializeLoggedErrorForPino };

const fastify = Fastify({
  logger: isProduction
    ? {
        level: 'warn',
        serializers,
        // Raw NDJSON on stdout (which Cloud Logging collects) and the same
        // lines as OTel log records for Axiom — see otelLogDestination.ts.
        stream: createOtelLogDestination({
          stdout: process.stdout,
          logger: logs.getLogger(AXIOM.SERVICE_NAME),
        }),
      }
    : {
        level: 'info',
        serializers,
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
  // fastify.log, not console: in production that stream is teed to Axiom
  // (otelLogDestination.ts), so a bare console line would land in Cloud
  // Logging only. Note the production logger's level is 'warn', so these two
  // are a dev convenience there rather than a startup record — the platform
  // reports a started revision itself.
  fastify.log.info(`API server listening on http://localhost:${port}`);
  fastify.log.info(`GraphiQL available at http://localhost:${port}/graphiql`);
} catch (err) {
  fastify.log.error(err);
  await shutdownObservability();
  process.exit(1);
}
