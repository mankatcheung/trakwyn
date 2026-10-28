/**
 * Popup startup timings (JEF-457), as `performance` measures named
 * `popup:<stage>`. Any build shows them in DevTools' Performance panel (or
 * `performance.getEntriesByType('measure')` in the popup's console); `pnpm dev`
 * also logs them. Nothing is sent anywhere.
 */
const PREFIX = 'popup:';

function log(entry: PerformanceMeasure | undefined): void {
  if (import.meta.env.DEV && entry) {
    console.debug(`[startup] ${entry.name} ${Math.round(entry.duration)}ms`);
  }
}

/** Runs `work` and records how long it took, whether it resolved or not. */
export async function timed<T>(stage: string, work: () => Promise<T>): Promise<T> {
  const start = `${PREFIX}${stage}:start`;
  performance.mark(start);
  try {
    return await work();
  } finally {
    log(performance.measure(`${PREFIX}${stage}`, start));
  }
}

/** Records the time from the popup opening to `milestone`, such as the clip showing. */
export function markSinceOpen(milestone: string): void {
  log(performance.measure(`${PREFIX}${milestone}`));
}
