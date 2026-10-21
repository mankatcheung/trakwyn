import { useEffect } from 'react';
import { isStaleChunkError, reloadForStaleChunk } from '#/lib/staleChunkReload';

interface StaleChunkReloaderProps {
  error: unknown;
}

/**
 * Reloads the page when the route error boundary caught a chunk that no
 * longer exists because this tab predates a deploy (see staleChunkReload.ts).
 *
 * Its own component, like `RouteErrorReporter`, because `__root.tsx` is
 * awkward to render in isolation; renders nothing. The reload itself is
 * guarded to once per window, so a genuine outage still reaches the fallback.
 */
export function StaleChunkReloader({ error }: StaleChunkReloaderProps) {
  const stale = isStaleChunkError(error);

  useEffect(() => {
    if (stale) reloadForStaleChunk();
  }, [stale]);

  return null;
}
