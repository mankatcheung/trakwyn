import { useEffect, useRef } from 'react';
import { AppState, type AppStateStatus } from 'react-native';
import { useSegments } from 'expo-router';
import { startHangWatchdog } from '../lib/analytics';

/**
 * Runs the JS hang watchdog while the app is in the foreground (JEF-369).
 * Renders nothing.
 *
 * The route comes from `useSegments()`, as in `NavigationBreadcrumbs`, so a
 * hang report says "an application detail screen" and never which one. It
 * is kept in a ref so a navigation does not restart the watchdog's clock.
 *
 * Stopped in the background and restarted on return: timers are suspended
 * while backgrounded, and the first late tick would otherwise read as a
 * hang the length of the time away.
 */
export function HangWatchdog() {
  const segments = useSegments();
  const route = `/${segments.join('/')}`;
  const routeRef = useRef(route);

  useEffect(() => {
    routeRef.current = route;
  }, [route]);

  useEffect(() => {
    let stop: (() => void) | null = null;

    const sync = (state: AppStateStatus) => {
      const inForeground = state !== 'background' && state !== 'inactive';
      if (inForeground && !stop) {
        stop = startHangWatchdog({ getRoute: () => routeRef.current });
      } else if (!inForeground && stop) {
        stop();
        stop = null;
      }
    };

    sync(AppState.currentState);
    const subscription = AppState.addEventListener('change', sync);
    return () => {
      subscription.remove();
      stop?.();
    };
  }, []);

  return null;
}
