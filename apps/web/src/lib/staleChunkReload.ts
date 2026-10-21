const RELOAD_FLAG = 'trakwyn:stale-chunk-reload';

// How long a page must survive after a reload before the guard resets, so a
// later deploy can recover again without a genuine outage looping reloads.
const GUARD_RESET_MS = 30_000;

// Chrome/Edge, Firefox and Safari word the same failure differently.
const STALE_CHUNK_PATTERN =
  /Failed to fetch dynamically imported module|error loading dynamically imported module|Importing a module script failed|Unable to preload CSS/i;

export function isStaleChunkError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : typeof error === 'string' ? error : '';
  return STALE_CHUNK_PATTERN.test(message);
}

/**
 * Reloads the page to pick up the current deploy's asset hashes. At most once
 * per guard window: if the reload does not fix it (a real outage, not a stale
 * tab), a second attempt would loop, so the error is left to surface instead.
 * Returns whether a reload was started.
 */
export function reloadForStaleChunk(): boolean {
  try {
    if (sessionStorage.getItem(RELOAD_FLAG)) return false;
    sessionStorage.setItem(RELOAD_FLAG, '1');
  } catch {
    // Storage blocked: reloading without the guard could loop forever.
    return false;
  }
  window.location.reload();
  return true;
}

/** Clears the guard so a later deploy can trigger a reload again. */
export function clearStaleChunkGuard(): void {
  try {
    sessionStorage.removeItem(RELOAD_FLAG);
  } catch {
    // Nothing to clear.
  }
}

/**
 * A tab opened before a deploy still references chunk filenames the new
 * deploy no longer serves (the service worker only caches chunks already
 * fetched). Vite fires `vite:preloadError` when such an import fails; a
 * reload fetches the new entry and its matching chunks. The guard resets
 * once the page has stayed up for a while, proving the reload worked.
 */
export function watchForStaleChunks(): () => void {
  const handler = (event: Event) => {
    if (reloadForStaleChunk()) event.preventDefault();
  };
  window.addEventListener('vite:preloadError', handler);
  const timer = setTimeout(clearStaleChunkGuard, GUARD_RESET_MS);
  return () => {
    window.removeEventListener('vite:preloadError', handler);
    clearTimeout(timer);
  };
}
