import { CookieConsent } from '#/features/legal/components/CookieConsent';
import { NavigationProgressBar } from '#/features/app-shell/components/NavigationProgressBar';

/**
 * What the root route renders on every page, signed in or not: the cookie
 * banner and the navigation progress bar. The route stays wiring only; the
 * pieces live in their features.
 */
export function RootOverlays() {
  return (
    <>
      <CookieConsent />
      <NavigationProgressBar />
    </>
  );
}
