import { useEffect, useState } from 'react';
import { hasSessionCookie } from '#/graphql/client';

/**
 * Starts `false` so a marketing page's first client render matches what SSR
 * produced (the server never sees the session cookie), then flips to `true`
 * on mount if one is present. Purely a display hint — chrome shared across
 * `/` and the `/features/*` pages reads this to swap "Sign in" for "Go to
 * dashboard"; it does not redirect anyone (see `index.tsx` for the one route
 * that also does that).
 */
export function useIsLoggedIn(): boolean {
  const [isLoggedIn, setIsLoggedIn] = useState(false);

  useEffect(() => {
    if (hasSessionCookie()) setIsLoggedIn(true);
  }, []);

  return isLoggedIn;
}
