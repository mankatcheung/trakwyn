import { register } from 'node:module';
import { createAddHookMessageChannel } from 'import-in-the-middle';
import {
  isObservabilityEnabled,
  startObservability,
} from '#src/infrastructure/observability/tracing.js';

/** import-in-the-middle's asynchronous ESM loader, resolved from this module. */
const ESM_LOADER_HOOK = 'import-in-the-middle/hook.mjs';

/**
 * Starts OpenTelemetry so its auto-instrumentations (graphql, pg, ioredis,
 * undici, http) actually patch the modules the app goes on to load (JEF-346).
 *
 * Two things have to be true for that, and neither was before:
 *
 * - **An ESM loader hook is registered.** The API is ESM, and an `import`ed
 *   module is only patchable through `import-in-the-middle`'s loader;
 *   `require-in-the-middle` alone sees nothing but CommonJS `require()` calls.
 *   The message channel limits the loader to the modules an instrumentation
 *   `Hook()`s, so the app's own modules are never wrapped.
 * - **The SDK starts before the app is imported.** ESM hoists static imports,
 *   so a `startObservability()` call in `index.ts` ran after `fastify`,
 *   `graphql` and `pg` were already loaded. Hence this runs from
 *   `src/instrumentation.ts`, preloaded with `node --import`.
 *
 * Resolves once the loader has acknowledged every hooked module, so nothing
 * the app imports can race ahead of its instrumentation. Outside production
 * the loader is never registered — `startObservability()` just logs why
 * telemetry is off (JEF-345).
 */
export async function registerInstrumentation(): Promise<void> {
  if (!isObservabilityEnabled) {
    startObservability();
    return;
  }

  const { registerOptions, waitForAllMessagesAcknowledged } = createAddHookMessageChannel();
  register(ESM_LOADER_HOOK, import.meta.url, registerOptions);
  startObservability();
  await waitForAllMessagesAcknowledged();
}
