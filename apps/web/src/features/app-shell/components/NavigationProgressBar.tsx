import { useEffect, useRef } from 'react';
import { useRouterState } from '@tanstack/react-router';
import NProgress from 'nprogress';

// Default NProgress template sets role="bar" on the progress element, which
// isn't a valid ARIA role and fails axe-core's aria-roles check. The bar is
// purely decorative (page loads are already announced via other means), so
// drop the role rather than reach for a real progressbar role, which would
// need aria-valuenow/min/max kept in sync with NProgress's internal state.
// barSelector must be overridden too — NProgress locates the bar element via
// `[role="bar"]` by default, so dropping the role without also updating the
// selector leaves it unable to find its own markup.
NProgress.configure({
  showSpinner: false,
  minimum: 0.15,
  speed: 200,
  template: '<div class="bar"><div class="peg"></div></div>',
  barSelector: '.bar',
});

export function NavigationProgressBar() {
  const isLoading = useRouterState({ select: (s) => s.status === 'pending' });
  const prevIsLoading = useRef(isLoading);

  useEffect(() => {
    if (isLoading && !prevIsLoading.current) {
      NProgress.start();
    }
    if (!isLoading && prevIsLoading.current) {
      NProgress.done();
    }
    prevIsLoading.current = isLoading;
  }, [isLoading]);

  useEffect(() => {
    return () => {
      NProgress.done();
    };
  }, []);

  return null;
}
