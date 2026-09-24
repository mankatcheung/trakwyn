import { createRouter as createTanStackRouter } from '@tanstack/react-router';
import { routeTree } from './routeTree.gen';
import { setRouteResolver } from '#/lib/analytics/routeTemplate';
import { queryClient } from '#/lib/queryClient';

export function getRouter() {
  const router = createTanStackRouter({
    routeTree,
    scrollRestoration: true,
    defaultPreload: 'intent',
    defaultPreloadStaleTime: 0,
    context: { queryClient },
  });

  // Analytics reports routes, not URLs (JEF-360): PostHog events carry
  // `/applications/$applicationId` rather than the id itself. Browser-only —
  // the server builds a router per request, and nothing reports from there.
  if (typeof window !== 'undefined') {
    setRouteResolver((pathname) => router.getMatchedRoutes(pathname)[2]?.fullPath);
  }

  return router;
}

declare module '@tanstack/react-router' {
  interface Register {
    router: ReturnType<typeof getRouter>;
  }
}
