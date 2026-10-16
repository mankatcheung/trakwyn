import { useEffect, useState } from 'react';

/** Tailwind breakpoints a caller may treat as "wide". */
export type WideViewportBreakpoint = 'sm' | 'md';

const WIDE_VIEWPORT_QUERIES: Record<WideViewportBreakpoint, string> = {
  sm: '(min-width: 640px)',
  md: '(min-width: 768px)',
};

/**
 * Whether the viewport is at least the given Tailwind breakpoint — `sm` unless
 * a caller asks for another, which is the width the app already switches
 * layout at.
 *
 * Starts `false` on every render, including the server's, and corrects itself
 * after mount. That ordering is deliberate: `matchMedia` does not exist during
 * SSR, and a hook that guessed a width would render one layout on the server
 * and another on hydration. The components using this only read it while an
 * overlay is open — never on first paint — so the correction is invisible.
 */
export function useIsWideViewport(breakpoint: WideViewportBreakpoint = 'sm'): boolean {
  const [isWide, setIsWide] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return;

    const query = window.matchMedia(WIDE_VIEWPORT_QUERIES[breakpoint]);
    setIsWide(query.matches);

    const onChange = (event: MediaQueryListEvent) => setIsWide(event.matches);
    query.addEventListener('change', onChange);
    return () => query.removeEventListener('change', onChange);
  }, [breakpoint]);

  return isWide;
}
