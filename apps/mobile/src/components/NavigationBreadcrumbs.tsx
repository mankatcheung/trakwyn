import { useEffect, useRef } from 'react';
import { useSegments } from 'expo-router';
import { addBreadcrumb } from '../lib/analytics';

/**
 * Records where the user navigated, as a breadcrumb attached to the next
 * exception (JEF-349). Renders nothing.
 *
 * **Route names only.** `useSegments()` returns the *file* segments, so a
 * conversation reads `(app)/applications/[id]` rather than
 * `(app)/applications/kP3xR2…` — the shape of the journey without the
 * identifiers. That is the whole point: a crash report should say the user
 * was on an application detail screen, not which application.
 *
 * The ref suppresses a repeat of the same route. Expo Router re-renders on
 * params and focus changes that do not move the user anywhere, and a trail
 * of twenty identical entries would push the genuinely informative ones out
 * of the buffer.
 */
export function NavigationBreadcrumbs() {
  const segments = useSegments();
  const lastRoute = useRef<string | null>(null);

  const route = `/${segments.join('/')}`;

  useEffect(() => {
    if (lastRoute.current === route) return;
    lastRoute.current = route;
    addBreadcrumb('Navigated', { route });
  }, [route]);

  return null;
}
