import { browser } from 'wxt/browser';
import { OBSERVABILITY, type ExtensionContext, type ObservabilityEvent } from '../../constants';
import { buildExceptionList } from './exceptionList';
import { scrubValue } from './scrub';
import { getLastTraceId } from './traceContext';

/**
 * The Clipper's error reporting (JEF-387): `$exception` events and a few
 * named fault events, posted straight to PostHog's capture endpoint.
 *
 * There is no SDK. `posthog-js` expects a `window` and `localStorage`, which
 * a background service worker has neither of, and an extension may not load
 * remote code. The web app's Vercel function reports the same way
 * (apps/web/src/server/observability/serverLogger.ts).
 *
 * What matters more than what it sends:
 *
 *  1. **Off without a key.** With no `VITE_POSTHOG_KEY` at build time, no
 *     request is made. That is the intended state in dev and CI.
 *  2. **No person.** Reports are operational data about the extension, sent
 *     without a consent gate, so they identify no one:
 *     `$process_person_profile: false`, a random `distinct_id` per event, no
 *     GeoIP. Nothing is stored between reports, so two cannot be linked.
 *  3. **Scrubbed.** Every property goes through `scrubValue`, and messages
 *     and stacks through `scrubString`.
 *  4. **Never throws, never retries.** A report that fails is dropped. It
 *     must not replace the error being reported or report itself.
 */

type Properties = Record<string, unknown>;

interface CaptureConfig {
  apiKey: string;
  captureUrl: string;
}

let context: ExtensionContext | undefined;
let listening = false;

/** Errors already reported, so an outer layer does not report the same one again. */
const reported = new WeakSet<object>();

export function markReported(error: unknown): void {
  if (typeof error === 'object' && error !== null) reported.add(error);
}

export function wasReported(error: unknown): boolean {
  return typeof error === 'object' && error !== null && reported.has(error);
}

/** Read per report rather than once, so a test can set the key. */
function captureConfig(): CaptureConfig | null {
  const apiKey: unknown = import.meta.env.VITE_POSTHOG_KEY;
  if (typeof apiKey !== 'string' || apiKey === '') return null;
  const configured: unknown = import.meta.env.VITE_POSTHOG_HOST;
  const host = typeof configured === 'string' && configured !== '' ? configured : null;
  return {
    apiKey,
    captureUrl: `${(host ?? OBSERVABILITY.DEFAULT_HOST).replace(/\/+$/, '')}${OBSERVABILITY.CAPTURE_PATH}`,
  };
}

/** The manifest version, which WXT takes from package.json. */
function release(): string | undefined {
  try {
    return browser.runtime.getManifest().version;
  } catch {
    return undefined;
  }
}

async function send(event: string, build: () => Properties): Promise<void> {
  // Building is inside the `try` too: a stack the parser chokes on must not
  // turn a report into a second error.
  try {
    const config = captureConfig();
    if (!config) return;
    const version = release();
    await fetch(config.captureUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        api_key: config.apiKey,
        event,
        distinct_id: crypto.randomUUID(),
        timestamp: new Date().toISOString(),
        properties: {
          ...build(),
          $process_person_profile: false,
          $geoip_disable: true,
          $lib: OBSERVABILITY.LIB,
          ...(context ? { context } : {}),
          ...(version ? { release: version } : {}),
        },
      }),
      // The popup closes under a pending request (it does when a sign-in
      // window opens); `keepalive` lets the report outlive it.
      keepalive: true,
      // Without `AbortSignal.timeout` (an old Safari) the report is sent
      // untimed rather than dropped by the `catch` below.
      signal:
        typeof AbortSignal.timeout === 'function'
          ? AbortSignal.timeout(OBSERVABILITY.SEND_TIMEOUT_MS)
          : undefined,
    });
  } catch {
    // Dropped. See the file header.
  }
}

function scrubbed(properties: Properties): Properties {
  return scrubValue(properties) as Properties;
}

/** Reports a named fault event. Resolves once sent or dropped; never rejects. */
export function captureEvent(
  event: ObservabilityEvent,
  properties: Properties = {},
): Promise<void> {
  return send(event, () => scrubbed(properties));
}

/**
 * Reports an error as `$exception`, once: a second call with the same error
 * object is a no-op. `handled: false` is for the global listeners.
 */
export function captureException(
  error: unknown,
  properties: Properties = {},
  handled = true,
): Promise<void> {
  if (wasReported(error)) return Promise.resolve();
  markReported(error);
  const traceId = getLastTraceId();
  return send(OBSERVABILITY.EXCEPTION_EVENT, () => ({
    ...(traceId ? { trace_id: traceId } : {}),
    ...scrubbed(properties),
    $exception_list: buildExceptionList(error, handled),
    $exception_level: 'error',
  }));
}

/**
 * Names this JS context on every report and catches what nothing else did.
 * Call once, first thing, in an entrypoint. `globalThis` is the window in
 * the popup and options page and the worker scope in the background.
 */
export function initObservability(extensionContext: ExtensionContext): void {
  context = extensionContext;
  // Once per JS context, however often this is called.
  if (listening) return;
  listening = true;
  globalThis.addEventListener('error', (event) => {
    const { error, message } = event as ErrorEvent;
    void captureException(error ?? new Error(message), {}, false);
  });
  globalThis.addEventListener('unhandledrejection', (event) => {
    void captureException((event as PromiseRejectionEvent).reason, {}, false);
  });
}

/** Test seam: forgets the context `initObservability` set. */
export function resetObservabilityForTests(): void {
  context = undefined;
}
