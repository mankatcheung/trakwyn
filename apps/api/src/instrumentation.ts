// Preloaded ahead of the app with `node --import ./dist/instrumentation.js`
// (the Dockerfile CMD and `pnpm start`), so OpenTelemetry is running before
// index.ts imports anything it instruments — see registerInstrumentation.ts.
//
// dotenv first: tracing.ts decides whether telemetry is on from process.env
// as it loads, and under `pnpm start` that config comes from .env.
import 'dotenv/config';
import { registerInstrumentation } from '#src/infrastructure/observability/registerInstrumentation.js';

await registerInstrumentation();
