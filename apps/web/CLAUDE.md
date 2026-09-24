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
- **Every other page-level feature is pinned off in `posthog.init` (JEF-366)**, because each follows the dashboard when left unset: `capture_dead_clicks: false`, `capture_heatmaps: false`, `disable_surveys`, `disable_product_tours` and `disable_conversations`. A new PostHog feature that defaults to the project toggle gets pinned here too.
- **The PostHog project's own settings are Terraform** (`infra/posthog/`, JEF-363): replay, network capture, heatmaps and surveys are off there too, and exception and web-vitals capture on, so a dashboard toggle cannot quietly contradict the client. Autocapture, dead clicks, product tours and conversations are the exception: the provider cannot set them, so the client flags are their only guard.
- **No PostHog cookie; no IPs (JEF-366).** `persistence: 'localStorage'` keeps PostHog's anonymous id out of the `.trakwyn.com` cookie jar, so it isn't sent to the API; `removeLegacyCookie()` deletes the cookie older visits wrote. The project has `anonymize_ips = true`, so PostHog stores no IP and does no GeoIP. Location is a `country` property instead: `getRequiresCookieConsent` returns Vercel's `x-vercel-ip-country` (validated as two letters, never guessed from `Accept-Language`), and `before_send` stamps it on every event, `$pageview` included.
- **Production env vars are Terraform** (`infra/vercel/`): `VITE_API_URL`, `VITE_POSTHOG_HOST`, and `VITE_POSTHOG_KEY` read from `infra/posthog`'s state. `VITE_APP_RELEASE` is deliberately unmanaged, since `vite.config.ts` derives it from the commit SHA. The Vercel project has no git connection; only CI's `deploy-web` deploys it.
- **Every event passes `before_send` → `lib/analytics/scrub.ts`.** It applies a property deny-list _plus_ pattern redaction (emails, JWTs, bearer tokens, query strings). The mobile app has a copy, and `scrubParity.test.ts` fails if they drift. The same goes for `lib/analytics/transportFailure.ts`, which decides which failed GraphQL requests are reported (5xx and unreachable only), guarded by `transportFailureParity.test.ts`.
- **Consent gate:** PostHog initialises inside `CookieConsent.tsx` behind `analyticsEnabled`, via dynamic `import()`, so nothing loads before consent. Exceptions raised earlier are buffered in memory, then sent or dropped.
- **`traceparent` goes to the API origin only.** `traceHeaders(url)` returns `{}` for any other origin; a third-party origin such as the Blob upload must not get a correlation id, and the header would trip CORS. The same id is sent as `trace_id` on exception events, which links a PostHog error to its Axiom trace.
- **Core Web Vitals (JEF-360):** LCP, INP, CLS and FCP are sent as `$web_vitals` through PostHog's `capture_performance`, not a second SDK, so they share the consent gate and scrubber. Attribution is off and the metrics are pinned in `WEB_VITALS_METRICS`. `before_send` first runs `templateEventUrls` (`lib/analytics/routeTemplate.ts`), which rewrites every page-URL property on every event (`$current_url`, `$pathname`, `$referrer`, the copies inside `$web_vitals_*_event`, and `route`) to the matched route template (`/applications/$applicationId`) via `router.getMatchedRoutes`, registered in `router.tsx`. It fails closed: an unmatched path becomes `/[unmatched]`. Stack-frame script URLs are left alone, because source maps need them.

## Tests

`gqlClient`- and router-mocked component tests live under `src/__tests__/components/`.
