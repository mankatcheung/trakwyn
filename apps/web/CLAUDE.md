# apps/web — TanStack Start + React Query + GraphQL

Loaded when working under `apps/web`. The cross-cutting conventions are in the root `CLAUDE.md`.

## Structure

- **Routing:** file-based under `src/routes/` (`@tanstack/react-router`).
  - `/` redirects.
  - `/login` and `/register` are public.
  - `/_authenticated/*` is the protected layout (`beforeLoad` redirects to `/login`), holding `dashboard` and `applications/*`.
- **Styling:** Tailwind v4 via `@tailwindcss/vite`. Shared components come from `packages/ui` (`@trakwyn/ui`, Storybook).
- **Path alias:** `#/*` maps to `./src/*`.
- **Dev proxy:** Vite proxies `/graphql` to `http://localhost:3001`, so `VITE_API_URL` defaults to `/graphql`.

## Data and auth

- **Client:** `gqlClient` (`graphql-request`, `src/graphql/client.ts`) with TanStack Query. It sends `credentials: 'include'` and keeps no token in JS; the browser attaches the HttpOnly cookies. Its `responseMiddleware` refreshes and retries on `UNAUTHORIZED`, then redirects to `/login` if the refresh fails.
- **Session detection:** `hasSessionCookie()` does a synchronous `document.cookie` read of the non-HttpOnly `trakwyn_logged_in` hint. It is used by `/`, `/login` and `/_authenticated`. These routes set **`ssr: false`**, because TanStack Start does not re-run `beforeLoad` on hydration otherwise. The cookie deploy prerequisites are in `apps/api/CLAUDE.md`.
- **Codegen:** after changing `.graphql` files or the API schema, run `pnpm codegen` (the API must be running). **Never edit `src/graphql/generated/` by hand.**

## Error reporting and analytics (JEF-349)

PostHog EU Cloud replaces `@vercel/analytics`; the API reports to Axiom only. It is **off by default**: without `VITE_POSTHOG_KEY` the SDK never loads, which is the intended state in dev and CI. These points are load-bearing:

- **Autocapture off** (`autocapture: false`) and **session replay off**, because these pages show company names, notes and salaries. Every event is named explicitly in `ANALYTICS_EVENTS`.
- **The PostHog project's own settings are Terraform** (`infra/posthog/`, JEF-363): replay, network capture, heatmaps and surveys are off there too, and exception and web-vitals capture on, so a dashboard toggle cannot quietly contradict the client. Click autocapture is the exception: the provider cannot set it, so `autocapture: false` here has no server-side backstop.
- **Production env vars are Terraform** (`infra/vercel/`): `VITE_API_URL`, `VITE_POSTHOG_HOST`, and `VITE_POSTHOG_KEY` read from `infra/posthog`'s state. `VITE_APP_RELEASE` is deliberately unmanaged, since `vite.config.ts` derives it from the commit SHA. The Vercel project has no git connection; only CI's `deploy-web` deploys it.
- **Every event passes `before_send` → `lib/analytics/scrub.ts`.** It applies a property deny-list _plus_ pattern redaction (emails, JWTs, bearer tokens, query strings). The mobile app has a copy, and `scrubParity.test.ts` fails if they drift.
- **Consent gate:** PostHog initialises inside `CookieConsent.tsx` behind `analyticsEnabled`, via dynamic `import()`, so nothing loads before consent. Exceptions raised earlier are buffered in memory, then sent or dropped.
- **`traceparent` goes to the API origin only.** `traceHeaders(url)` returns `{}` for any other origin; a third-party origin such as the Blob upload must not get a correlation id, and the header would trip CORS. The same id is sent as `trace_id` on exception events, which links a PostHog error to its Axiom trace.
- **Core Web Vitals (JEF-360):** LCP, INP, CLS and FCP are sent as `$web_vitals` through PostHog's `capture_performance`, not a second SDK, so they share the consent gate and scrubber. Attribution is off and the metrics are pinned in `WEB_VITALS_METRICS`. `before_send` first runs `templateEventUrls` (`lib/analytics/routeTemplate.ts`), which rewrites every page-URL property on every event (`$current_url`, `$pathname`, `$referrer`, the copies inside `$web_vitals_*_event`, and `route`) to the matched route template (`/applications/$applicationId`) via `router.getMatchedRoutes`, registered in `router.tsx`. It fails closed: an unmatched path becomes `/[unmatched]`. Stack-frame script URLs are left alone, because source maps need them.

## Server-side errors to Axiom (JEF-359)

The app is not static: nitro's `vercel` preset prerenders the marketing pages, but every other route runs in a Vercel function, as does the one server function `getRequiresCookieConsent`. Their errors go to Axiom's **`trakwyn-web`** dataset, never the API's, through `src/server/observability/`. PostHog cannot see them, since it runs in the browser after consent. Like the API (JEF-345), export is **production-only**: it needs `NODE_ENV=production` plus the server-only `AXIOM_WEB_TOKEN`/`AXIOM_WEB_DATASET`. Anywhere else each line goes to stdout only. These points are load-bearing:

- **Three capture points, because TanStack Start exposes no single one.** `src/server.ts` (a custom server entry) reads errored matches after load (`phase: 'load'`) and catches a failed document shell (`'shell'`). `src/start.ts`'s function middleware catches server functions, because their errors are serialised into a 500 before any outer layer sees a throw. Each report is deduplicated through a `WeakSet`, so a server function called from a loader is reported once.
- **A component that throws during SSR still answers 200.** Every route component sits in a Suspense boundary, so React reports the error only to the renderer's `onError`. TanStack forwards that to `console.error("Error in renderTo…")` and nothing else. `installRenderErrorCapture` watches for that one call (`'render'`), and a test reads the installed TanStack source so a change to it fails CI instead of silently stopping capture. The send runs mid-stream, so it is handed to Vercel's `waitUntil` (`vercelWaitUntil.ts`, a local copy of `@vercel/functions`' lookup). Adding a dependency to this package re-resolves its `latest`-pinned TanStack packages.
- **`src/start.ts` restates the CSRF middleware.** Declaring `requestMiddleware` replaces TanStack's built-in CSRF check for server functions instead of adding to it. `start.test.ts` fails if it is dropped.
- **A line holds the method, the path, Vercel's request id, and the scrubbed error.** It never holds the query string (this app's reset, verification and share tokens live there), cookies, `Authorization`, or a server function's input. Messages and stacks pass `scrubString` from `lib/analytics/scrub.ts`, the same redaction PostHog events get.
- **The token must never be `VITE_`-prefixed.** It is read from `process.env` inside `createServerOnlyFn`, which is stripped from the client bundle. It is ingest-only, scoped to `trakwyn-web`, and set by hand as a sensitive Vercel var (`infra/vercel/README.md`). The monitor is `web_server_error` in `infra/axiom/monitors.tf` and keys on `SERVER_LOG_EVENTS`, so rename those in the same PR.

## Tests

`gqlClient`- and router-mocked component tests live under `src/__tests__/components/`.
