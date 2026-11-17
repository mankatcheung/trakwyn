import { useEffect, useState } from 'react';

/**
 * Reactive CSS media-query match. SSR-safe: renders `false` on the server and
 * re-syncs from the real query in the first effect, so a hydration mismatch is
 * impossible — the client briefly shows the mobile layout before the first
 * paint promotes it, which is invisible at worst.
 */
export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(() =>
    typeof window === 'undefined' ? false : window.matchMedia(query).matches,
  );

  useEffect(() => {
    const mql = window.matchMedia(query);
    const onChange = (event: MediaQueryListEvent) => setMatches(event.matches);
    // The lazy initializer ran against whatever matchMedia said at render
    // time; bring state in line with the live query before listening.
    setMatches(mql.matches);
    mql.addEventListener('change', onChange);
    return () => mql.removeEventListener('change', onChange);
  }, [query]);

  return matches;
}
