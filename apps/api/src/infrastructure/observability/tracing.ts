import { NodeSDK } from '@opentelemetry/sdk-node';
import { BatchSpanProcessor } from '@opentelemetry/sdk-trace';
import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-proto';
import { OTLPMetricExporter } from '@opentelemetry/exporter-metrics-otlp-proto';
import { OTLPLogExporter } from '@opentelemetry/exporter-logs-otlp-proto';
import { BatchLogRecordProcessor } from '@opentelemetry/sdk-logs';
import { PeriodicExportingMetricReader } from '@opentelemetry/sdk-metrics';
import { resourceFromAttributes } from '@opentelemetry/resources';
import {
  ATTR_SERVICE_NAME,
  ATTR_DEPLOYMENT_ENVIRONMENT_NAME,
} from '@opentelemetry/semantic-conventions';
// `@fastify/otel` uses a CJS `export =` of a namespace; esModuleInterop's
// default-import synthesis resolves to that whole namespace rather than the
// class, so import the named export instead.
import { FastifyOtelInstrumentation } from '@fastify/otel';
import { AUTH_HEADER, AXIOM, ENV, NODE_ENV } from '#src/infrastructure/config/constants.js';
import { applyGraphQLOperationSpanName } from '#src/infrastructure/observability/graphqlOperationSpanName.js';

/**
 * Must be registered as a Fastify plugin in buildApp() *before* routes and
 * other plugins are defined (see app.ts) — that's how it's able to wrap every
 * route handler and lifecycle hook. Created unconditionally so app.ts always
 * has something to register; when observability is disabled it just traces
 * against the global no-op tracer, so registering it costs nothing extra.
 */
export const fastifyOtelInstrumentation = new FastifyOtelInstrumentation();

const isProduction = process.env[ENV.NODE_ENV] === NODE_ENV.PRODUCTION;
const isAxiomConfigured = Boolean(process.env[ENV.AXIOM_TOKEN] && process.env[ENV.AXIOM_DATASET]);

/**
 * True when this is a production process with enough config to ship
 * telemetry to Axiom. Telemetry is production-only by design (JEF-345): a
 * developer's `.env` carrying an Axiom token must not send local traffic
 * into the production datasets, so dev and test stay off regardless.
 */
export const isObservabilityEnabled = isProduction && isAxiomConfigured;

let sdk: NodeSDK | undefined;
let spanProcessor: BatchSpanProcessor | undefined;
let logProcessor: BatchLogRecordProcessor | undefined;
let metricReader: PeriodicExportingMetricReader | undefined;

/**
 * Awaitably flushes all buffered spans, log records and metrics to their Axiom
 * exporters.
 *
 * Cloud Run's request-based billing throttles an instance's CPU to near zero
 * as soon as it has no request in flight, so a batch processor relying on its
 * own export timer (or the default 60s metric collection interval) may not
 * get to run until the next request arrives — or ever, if the instance scales
 * to zero first. This is the primary export path: it's awaited in a Fastify
 * `onResponse` hook in buildApp(), which runs after each response is written
 * to the client but while the request still counts as in flight. Combined
 * with the near-0 scheduled delay on the span and log processors, telemetry
 * leaves the instance while it still has CPU. No-ops when the SDK never
 * started.
 */
export async function flushObservability(): Promise<void> {
  if (!sdk) return;

  try {
    await Promise.all([
      spanProcessor?.forceFlush(),
      logProcessor?.forceFlush(),
      metricReader?.forceFlush(),
    ]);
  } catch (err: unknown) {
    // console, not the logger, and deliberately so (JEF-351): a log line
    // emitted here would be handed to the very log processor whose flush just
    // failed, so the report of the failure would be the next thing at risk of
    // being lost. stdout is the one path that does not depend on what broke.
    console.error('[observability] flush error', err);
  }
}

/**
 * Shuts the SDK down, which flushes and closes every pipeline. Called once by
 * the entrypoint's SIGTERM/SIGINT handler (see gracefulShutdown.ts) after the
 * server has stopped taking requests, so the last requests' telemetry is
 * included. Never rejects: the process is exiting either way. No-ops when the
 * SDK never started.
 */
export async function shutdownObservability(): Promise<void> {
  if (!sdk) return;

  try {
    await sdk.shutdown();
  } catch (err: unknown) {
    // Same reasoning as flushObservability, and more so: the SDK is being
    // torn down, so its log pipeline is already closing (JEF-351).
    console.error('[observability] shutdown error', err);
  }
}

/**
 * Starts the OpenTelemetry SDK, exporting traces and logs (and, when
 * configured, metrics) to Axiom via OTLP. Logs reach the SDK through the
 * pino destination in otelLogDestination.ts. No-ops outside production, and
 * when AXIOM_TOKEN/AXIOM_DATASET aren't set.
 *
 * Must be called before any instrumented module (http, fastify, etc.) is
 * imported anywhere in the process, which is why it is called from the
 * `--import` preload (instrumentation.ts via registerInstrumentation.ts)
 * rather than from index.ts, whose static imports ESM evaluates first.
 */
export function startObservability(): void {
  if (!isObservabilityEnabled) {
    // Every console line in this function stays console on purpose
    // (JEF-351). It runs from the `--import` preload, before Fastify — and
    // therefore before any pino logger — exists, and before the exporter it
    // is reporting on has started. There is no pipe to Axiom yet to use.
    console.info(
      isAxiomConfigured
        ? '[observability] NODE_ENV is not production — tracing, logs and metrics are disabled.'
        : '[observability] AXIOM_TOKEN/AXIOM_DATASET not set — tracing and metrics are disabled.',
    );
    return;
  }

  const token = process.env[ENV.AXIOM_TOKEN]!;
  const dataset = process.env[ENV.AXIOM_DATASET]!;
  // Axiom requires a distinct Metrics-type dataset (and header) from the
  // Events-type dataset used for traces/logs — see the AXIOM constant docs.
  const metricsDataset = process.env[ENV.AXIOM_METRICS_DATASET];

  const authHeader = { Authorization: `${AUTH_HEADER.BEARER_PREFIX}${token}` };

  const traceExporter = new OTLPTraceExporter({
    url: `${AXIOM.API_URL}${AXIOM.TRACES_PATH}`,
    headers: { ...authHeader, [AXIOM.DATASET_HEADER]: dataset },
  });

  // Constructed explicitly (instead of letting NodeSDK build one from
  // `traceExporter`) so we hold the instance and can forceFlush() it from
  // flushObservability(). The near-0 scheduled delay is defense-in-depth for
  // the CPU-throttling window — see flushObservability()'s doc.
  spanProcessor = new BatchSpanProcessor({
    exporter: traceExporter,
    scheduledDelayMillis: 0,
  });

  // Logs share the Events-type dataset with traces, so Axiom can correlate a
  // log line with the span it was written under.
  logProcessor = new BatchLogRecordProcessor({
    exporter: new OTLPLogExporter({
      url: `${AXIOM.API_URL}${AXIOM.LOGS_PATH}`,
      headers: { ...authHeader, [AXIOM.DATASET_HEADER]: dataset },
    }),
    scheduledDelayMillis: 0,
  });

  if (metricsDataset) {
    metricReader = new PeriodicExportingMetricReader({
      exporter: new OTLPMetricExporter({
        url: `${AXIOM.API_URL}${AXIOM.METRICS_PATH}`,
        headers: { ...authHeader, [AXIOM.METRICS_DATASET_HEADER]: metricsDataset },
      }),
    });
  }

  sdk = new NodeSDK({
    resource: resourceFromAttributes({
      [ATTR_SERVICE_NAME]: AXIOM.SERVICE_NAME,
      [ATTR_DEPLOYMENT_ENVIRONMENT_NAME]: NODE_ENV.PRODUCTION,
    }),
    spanProcessors: [spanProcessor],
    logRecordProcessors: [logProcessor],
    metricReaders: metricReader ? [metricReader] : [],
    instrumentations: [
      getNodeAutoInstrumentations({
        // Disabled: fires on every file read/write (module loading, temp
        // files, log writes) and drowns out application-relevant spans.
        '@opentelemetry/instrumentation-fs': { enabled: false },
        // One span per resolver that does real work (e.g. Query.applications)
        // rather than one per scalar field, and one per list field rather
        // than one per item.
        // Every GraphQL request is `POST /graphql`; this renames its span
        // after the operation — see graphqlOperationSpanName.ts.
        '@opentelemetry/instrumentation-http': {
          applyCustomAttributesOnSpan: applyGraphQLOperationSpanName,
        },
        '@opentelemetry/instrumentation-graphql': {
          ignoreTrivialResolveSpans: true,
          mergeItems: true,
        },
      }),
      fastifyOtelInstrumentation,
    ],
  });

  sdk.start();

  if (!metricsDataset) {
    console.info(
      '[observability] AXIOM_METRICS_DATASET not set — metrics export is disabled (traces and logs are still active).',
    );
  }

  console.info(`[observability] Axiom tracing enabled${metricsDataset ? ' with metrics' : ''}.`);
}
