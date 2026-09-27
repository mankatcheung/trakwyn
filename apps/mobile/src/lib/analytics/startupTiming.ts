import { ANALYTICS_EVENTS, captureEvent } from './analytics';

/**
 * Cold-start time (JEF-369): how long from the app process starting to the
 * root layout having restored auth and rendered `(app)` or `(auth)`. That
 * span holds the SecureStore read and the proactive token refresh, so a
 * slow API or a misbehaving keychain shows up here before anywhere else.
 *
 * **Not `performance.timeOrigin`.** React Native's `performance.now()`
 * counts from *system boot*, not app start (see `NativePerformance::now`),
 * so `now()` on its own is not a duration. The start has to come from a
 * mark in the same timebase: `rnStartupTiming.startTime`, which is the
 * native app-start marker where the host sets one and the runtime's
 * initialisation otherwise. Where even that is missing (web preview, an
 * old architecture build), the fallback is the moment this module was
 * evaluated — later than the real start, so `start_marker` says which one
 * a number was measured from.
 */

export type StartupOutcome = 'signed_in' | 'signed_out';
export type StartMarker = 'native' | 'js_module';

/** The slice of `performance` this needs, so tests can pass a fake clock. */
export interface StartupClock {
  now(): number;
  readonly rnStartupTiming?: { readonly startTime?: number | null };
}

export interface ColdStartMeasurement {
  duration_ms: number;
  start_marker: StartMarker;
}

function readNow(clock: StartupClock): number | null {
  try {
    const now = clock.now();
    return Number.isFinite(now) ? now : null;
  } catch {
    return null;
  }
}

const moduleEvaluatedAt = readNow(globalThis.performance);

let reported = false;

/**
 * `rnStartupTiming` is a getter that calls into a native module, so it can
 * throw where that module is absent rather than just returning nothing.
 */
function nativeStartTime(clock: StartupClock, now: number): number | null {
  try {
    const start = clock.rnStartupTiming?.startTime;
    if (typeof start !== 'number' || !Number.isFinite(start)) return null;
    return start > 0 && start <= now ? start : null;
  } catch {
    return null;
  }
}

/** The time since the process started, or null when there is nothing to measure from. */
export function measureColdStart(
  clock: StartupClock = globalThis.performance,
  jsModuleStart: number | null = moduleEvaluatedAt,
): ColdStartMeasurement | null {
  const now = readNow(clock);
  if (now === null) return null;

  const native = nativeStartTime(clock, now);
  if (native !== null) {
    return { duration_ms: Math.round(now - native), start_marker: 'native' };
  }
  if (jsModuleStart !== null && jsModuleStart <= now) {
    return { duration_ms: Math.round(now - jsModuleStart), start_marker: 'js_module' };
  }
  return null;
}

/**
 * Sends `app_started` once per process. The root navigator remounts on a
 * fast refresh and after an error boundary reset; neither is a cold start,
 * so the guard lives here rather than in a ref.
 */
export function reportAppStarted(
  outcome: StartupOutcome,
  clock: StartupClock = globalThis.performance,
): void {
  if (reported) return;
  reported = true;
  const measurement = measureColdStart(clock);
  if (!measurement) return;
  captureEvent(ANALYTICS_EVENTS.APP_STARTED, { ...measurement, outcome });
}

/** Test seam: forgets that `app_started` was sent. */
export function resetStartupTimingForTests(): void {
  reported = false;
}
