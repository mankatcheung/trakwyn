import { useEffect } from 'react';
import {
  HeadContent,
  Scripts,
  createRootRouteWithContext,
  useRouter,
  useRouterState,
} from '@tanstack/react-router';
import { TanStackRouterDevtoolsPanel } from '@tanstack/react-router-devtools';
import { TanStackDevtools } from '@tanstack/react-devtools';
import { QueryClientProvider, type QueryClient } from '@tanstack/react-query';
import { Toaster } from 'sonner';
import { queryClient } from '#/lib/queryClient';
import { THEME_INIT_SCRIPT, ThemeProvider, useTheme } from '#/lib/theme';
import {
  LOCALE_INIT_SCRIPT,
  LocaleProvider,
  ensureLocaleLoaded,
  localeFromSearch,
  useLocale,
  type Locale,
} from '#/lib/i18n';
import { indexedLocale } from '#/lib/localePaths';
import { localizedHref } from '#/lib/localeRewrite';
import { RootOverlays } from '../features/app-shell/pages/RootOverlays';
import { NotFoundPage } from '../features/app-shell/pages/NotFoundPage';
import { RouteErrorPage } from '../features/app-shell/pages/RouteErrorPage';
import { watchForServiceWorkerUpdate } from '#/lib/swUpdateToast';
import { replayPendingOperations } from '#/lib/pendingOperations';
import { watchForStaleChunks } from '#/lib/staleChunkReload';

import appCss from '../styles.css?url';

export interface RouterContext {
  queryClient: QueryClient;
}

export const Route = createRootRouteWithContext<RouterContext>()({
  // The language the URL names (`/zh-hk/pricing`, or the legacy `?locale=`),
  // as one of the locales that have pages of their own — English otherwise.
  // Marketing routes build their <head> from it (JEF-653), and its bundle has
  // to be loaded first, on the server as well, or the title and the page
  // would be rendered in English.
  beforeLoad: async ({ location }) => {
    const pageLocale = indexedLocale(localeFromSearch(location.search)) ?? 'en';
    await ensureLocaleLoaded(pageLocale);
    return { pageLocale };
  },
  head: () => ({
    meta: [
      { charSet: 'utf-8' },
      {
        name: 'viewport',
        content: 'width=device-width, initial-scale=1, viewport-fit=cover',
      },
      { title: 'Trakwyn' },
      { name: 'theme-color', content: '#1d4ed8' },
    ],
    links: [
      { rel: 'stylesheet', href: appCss },
      { rel: 'manifest', href: '/manifest.webmanifest' },
      { rel: 'icon', href: '/favicon.svg', type: 'image/svg+xml' },
      { rel: 'icon', href: '/favicon.ico', sizes: 'any' },
      { rel: 'apple-touch-icon', href: '/apple-touch-icon.png' },
    ],
  }),
  notFoundComponent: NotFoundPage,
  errorComponent: RouteErrorPage,
  shellComponent: RootDocument,
});

function AppToaster() {
  const { theme } = useTheme();
  return <Toaster richColors theme={theme} />;
}

function RootDocument({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const urlLocale = useRouterState({ select: (s) => localeFromSearch(s.location.search) });
  // On a page that has a URL per language, picking a language moves to that
  // URL (JEF-653), so the back button, a reload and a copied link keep it.
  // Anywhere else `localizedHref` has nothing to say and the URL is untouched.
  const followLocale = (next: Locale) => {
    const href = localizedHref(router.latestLocation, next);
    if (href) router.history.push(href);
  };
  return (
    <LocaleProvider urlLocale={urlLocale} onLocaleChange={followLocale}>
      <LocalizedDocument>{children}</LocalizedDocument>
    </LocaleProvider>
  );
}

function LocalizedDocument({ children }: { children: React.ReactNode }) {
  const { locale } = useLocale();
  // Registered manually with the plain browser API rather than a build
  // plugin's virtual-module helper: this file is isomorphic (rendered for
  // both the client and server Vite environments), and any such virtual
  // module only resolves for the client build — importing it here would
  // break the server bundle. sw.js (apps/web/public/sw.js) is a real,
  // hand-written static file — see its own comments for why.
  useEffect(() => {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js');
    }
  }, []);

  // Prompts for a refresh when a new SW version takes over this tab instead
  // of leaving an already-open install running stale code — see
  // swUpdateToast.ts for why this needs more than just skipWaiting().
  useEffect(() => watchForServiceWorkerUpdate(), []);

  // Recover from a tab that predates a deploy asking for chunks that no
  // longer exist — see staleChunkReload.ts.
  useEffect(() => watchForStaleChunks(), []);

  // A delete waiting out its undo window lives in a setTimeout, which dies
  // with the tab. Anything that was still pending when the page went away is
  // sent now, so a refresh postpones the delete instead of dropping it after
  // the UI already reported it as done — see pendingOperations.ts (JEF-191).
  useEffect(() => {
    void replayPendingOperations();
  }, []);

  // Listen for messages from the service worker (e.g. push notification clicks)
  useEffect(() => {
    const handler = (event: MessageEvent) => {
      if (
        event.data &&
        typeof event.data === 'object' &&
        event.data.type === 'push-notification-click' &&
        typeof event.data.url === 'string'
      ) {
        // Navigate within the SPA — the service worker has already focused
        // this window, so we can just change the URL
        window.location.href = event.data.url;
      }
    };

    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.addEventListener('message', handler);
      return () => navigator.serviceWorker.removeEventListener('message', handler);
    }
  }, []);

  return (
    <html lang={locale} suppressHydrationWarning>
      <head>
        <HeadContent />
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
        <script dangerouslySetInnerHTML={{ __html: LOCALE_INIT_SCRIPT }} />
      </head>
      <body>
        <ThemeProvider>
          <RootOverlays />
          <AppToaster />
          <QueryClientProvider client={queryClient}>
            {children}
            <TanStackDevtools
              config={{ position: 'bottom-right' }}
              plugins={[{ name: 'Tanstack Router', render: <TanStackRouterDevtoolsPanel /> }]}
            />
          </QueryClientProvider>
        </ThemeProvider>
        <Scripts />
      </body>
    </html>
  );
}
