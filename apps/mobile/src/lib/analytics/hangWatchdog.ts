import {
  APP_HANG_THRESHOLD_MS,
  HANG_BREADCRUMB_MS,
  HANG_MAX_PLAUSIBLE_MS,
  HANG_WATCHDOG_INTERVAL_MS,
} from '../../constants';
import { addBreadcrumb, captureException } from './analytics';

/**
 * JS hang detection (JEF-369). A blocked JS thread — a huge list render, a
 * synchronous parse of a long chat history — is not a crash, so nothing
 * else reports it; the user just sees a frozen screen.
 *
 * A timer set for every `HANG_WATCHDOG_INTERVAL_MS` can only fire when the
 * thread is free, so however late a tick arrives is how long the thread
 * was busy. That is measured on the monotonic `performance.now()`, which a
 * wall-clock change cannot fake.
 *
 * Reported as an exception rather than an event so it lands in Error
 * Tracking beside crashes, with the breadcrumb trail that led up to it.
 * Only the first hang of a process is reported: a device slow enough to
 * hang once usually hangs repeatedly, and one report with its trail says
 * as much as twenty. Every block still leaves a breadcrumb.
 *
 * The caller stops the watchdog while the app is in the background, where
 * timers are suspended and the first tick back would read as a hang as
 * long as the time away. That relies on the AppState event reaching JS
 * before the OS freezes the process, which is not guaranteed, so a gap
 * beyond `HANG_MAX_PLAUSIBLE_MS` is also discarded as a suspension.
 */

export interface HangWatchdogOptions {
  /** The current route shape, e.g. `/(app)/applications/[id]` — never a pathname. */
  getRoute: () => string;
  now?: () => number;
}

let hangReported = false;

function defaultNow(): number {
  return globalThis.performance.now();
}

/** Starts the watchdog and returns the function that stops it. */
export function startHangWatchdog({ getRoute, now = defaultNow }: HangWatchdogOptions): () => void {
  let lastTick = now();

  const timer = setInterval(() => {
    const tick = now();
    const blockedMs = Math.round(tick - lastTick - HANG_WATCHDOG_INTERVAL_MS);
    lastTick = tick;
    if (blockedMs < HANG_BREADCRUMB_MS || blockedMs > HANG_MAX_PLAUSIBLE_MS) return;

    const route = getRoute();
    addBreadcrumb('JS thread blocked', { blocked_ms: blockedMs, route });
    if (blockedMs < APP_HANG_THRESHOLD_MS || hangReported) return;

    hangReported = true;
    captureException(new Error('JS thread blocked'), {
      kind: 'app_hang',
      blocked_ms: blockedMs,
      route,
    });
  }, HANG_WATCHDOG_INTERVAL_MS);

  return () => clearInterval(timer);
}

/** Test seam: allows another `app_hang` report. */
export function resetHangWatchdogForTests(): void {
  hangReported = false;
}
