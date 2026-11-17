import { useCallback, useRef } from 'react';

/**
 * Returns a callback ref to attach to a sentinel element; calls `onIntersect`
 * whenever that element scrolls into view while `enabled` is true.
 */
/* eslint-disable react-hooks/refs -- opted out below with 'use no memo'; the reason is there */
export function useInfiniteScrollSentinel(onIntersect: () => void, enabled: boolean) {
  // Writes a ref during render so the observer always calls the latest callback; the compiler rejects that.
  'use no memo';

  const onIntersectRef = useRef(onIntersect);
  onIntersectRef.current = onIntersect;
  const observerRef = useRef<IntersectionObserver | null>(null);

  return useCallback(
    (node: HTMLDivElement | null) => {
      observerRef.current?.disconnect();
      observerRef.current = null;
      if (!node || !enabled) return;

      observerRef.current = new IntersectionObserver(
        ([entry]) => {
          if (entry.isIntersecting) onIntersectRef.current();
        },
        { rootMargin: '200px' },
      );
      observerRef.current.observe(node);
    },
    [enabled],
  );
}
