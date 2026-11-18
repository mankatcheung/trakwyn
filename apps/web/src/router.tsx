import { createRouter as createTanStackRouter } from '@tanstack/react-router';
import { routeTree } from './routeTree.gen';
import { setRouteResolver } from '#/lib/analytics/routeTemplate';
import { waitForUrlLocale } from '#/lib/i18n';
import { createLocaleRewrite } from '#/lib/localeRewrite';
import { stripLocalePrefix } from '#/lib/localePaths';
import { queryClient } from '#/lib/queryClient';

export async function getRouter() {
  // A prerendered `/zh-hk/…` page is Chinese HTML; hydrating before its
  // bundle has loaded would render English over it (JEF-653). Start awaits
  // this on the client before it hydrates, and a no-op everywhere else.
  await waitForUrlLocale();

  // Set right after construction; the rewrite below may run before then.
  const created: { router?: { latestLocation: { search: Record<string, unknown> } } } = {};

  const router = createTanStackRouter({
    routeTree,
    scrollRestoration: true,
    defaultPreload: 'intent',
    defaultPreloadStaleTime: 0,
    context: { queryClient },
    // `/zh-hk/pricing` is the `/pricing` route with `?locale=zh-HK` (JEF-653).
    // The rewrite reads the page's locale from the router it belongs to.
    rewrite: createLocaleRewrite(() => created.router?.latestLocation.search.locale),
  });
  created.router = router;

  // Analytics reports routes, not URLs (JEF-360): PostHog events carry
  // `/applications/$applicationId` rather than the id itself. Browser-only —
  // the server builds a router per request, and nothing reports from there.
  // The resolver gets the public pathname, so a locale prefix comes off first.
  if (typeof window !== 'undefined') {
    setRouteResolver(
      (pathname) => router.getMatchedRoutes(stripLocalePrefix(pathname))[2]?.fullPath,
    );
  }

  return router;
}

declare module '@tanstack/react-router' {
  interface Register {
    router: Awaited<ReturnType<typeof getRouter>>;
  }
}
