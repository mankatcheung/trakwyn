import { useEffect, useRef } from 'react';
import { captureException } from '#/lib/analytics';

interface RouteErrorReporterProps {
  error: unknown;
}

/**
 * Reports a render-time error caught by the route error boundary (JEF-349).
 *
 * Its own component rather than an effect inside `RouteError` for two
 * reasons: `__root.tsx` is excluded from coverage and awkward to render in
 * isolation, and reporting is a distinct concern from the fallback UI —
 * this renders nothing.
 *
 * **Exactly once per error.** React re-renders a boundary's fallback like
 * any other component — a locale change, a theme toggle, a parent's state
 * update — and a report per render would turn one broken page into a
 * stream of identical events. The ref holds the error object that was
 * already reported, so a *different* error still reports, which a plain
 * `[]` dependency list would not manage.
 *
 * The error itself is what PostHog groups on; no route or release is passed
 * here because `captureException` attaches both.
 */
export function RouteErrorReporter({ error }: RouteErrorReporterProps) {
  const reported = useRef<unknown>(null);

  useEffect(() => {
    if (reported.current === error) return;
    reported.current = error;
    captureException(error, { kind: 'route_error_boundary' });
  }, [error]);

  return null;
}
