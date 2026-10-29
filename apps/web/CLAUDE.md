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

## CV import (JEF-461)

The profile page's "Import from CV" button opens `CvImportDialog` (`routes/_authenticated/profile/-components/`): choose a file, read it, review the entries, save the ticked ones. The API side is in `apps/api/CLAUDE.md`.

- **The upload is a plain `fetch`, not `gqlClient`** (`lib/cvImport.ts`): multipart to `CV_IMPORT_URL`, derived from `VITE_API_URL` like the chat stream's. It sends `credentials: 'include'`, the required `x-trakwyn-upload` header (the API's CSRF guard, which must match its constant) and no `Content-Type`, so the browser adds the multipart boundary. The vite dev proxy has an entry for `/profile/cv-import`, which is exact enough not to catch the web app's own `/profile` routes.
- **A 401 is refreshed and retried once** through an ordinary GraphQL call, since a plain `fetch` has no refresh of its own and the access token is short-lived; if the refresh fails, `gqlClient` has already signed the user out.
- **The file is checked in the browser first** (type, `.doc`, empty, 10 MB) so a wrong file is turned away with no request. The input's `accept` lists extensions as well as types because some systems report no type for `.docx`; `resolveCvMimeType` retypes the part from the extension for the same reason. The API repeats every check.
- **Review state is plain data** (`cvImportDrafts.ts`): rows start ticked unless the profile already has them (`alreadyInProfile`), a ticked row that has been edited into something invalid blocks Import, and only ticked rows are sent. Save guards a double click with a ref, because the API would add every row twice.
- **No `.graphql` file or codegen:** the confirm mutation is an inline string in `profileQueries.ts`, like the rest of the profile.

## Email verification wall (JEF-438)

- **The guard is `beforeLoad` on `/_authenticated`**, which awaits `checkEmailVerification()` and redirects an unverified account to `/verify-email-required`, a full-page route outside the layout. It has to be a `beforeLoad` and not a component wrapped around the layout: child route loaders (the dashboard's `ensureQueryData`) run regardless and the API refuses each one, so the error boundary would replace the page before a component gate rendered. The cookie check stays synchronous and first. A failed check lets the user through, because the API enforces the wall itself (`apps/api/CLAUDE.md`); the guard is the polite layer.
- **One request per session once verified.** `lib/emailVerification.ts` caches the answer under one query key, with an infinite `staleTime` once verified and 10 s while not. The wall page refetches on window focus, so verifying in another tab sends the user on to `/dashboard`; `/verify-email-required` itself redirects a verified user there, so it is never a dead end.
- The page offers resend (a 60 s cooldown, a "wait a few minutes" message on `RATE_LIMITED`, a spam-folder hint), "I've verified", a different email (the `requestEmailChange` mutation, which needs the password) and sign out. Registering signs the user in, so the register confirmation links to `/dashboard`, not `/login` (which would only bounce them there).
- The queries are inline strings in `lib/emailVerification.ts`, like Plans, so no `.graphql` file.

## First-run welcome flow (JEF-460)

- **The guard is the second half of `/_authenticated`'s `beforeLoad`**: after the email check passes, `checkOnboarding()` (`lib/onboarding.ts`) reads `me.onboardingCompletedAt` and `needsWelcome` sends a user who has never finished or skipped the flow to `/welcome`. `/welcome`, `/profile`, `/settings/*` and `/oauth` are exempt, because the flow links to them and they would bounce back. A failed check lets the user through: the flow is an offer, not a wall. `/welcome` itself sends a finished user to `/dashboard`.
- **One request per session once finished,** like the email check: the answer is cached under `ONBOARDING_STATE_KEY` with an infinite `staleTime` once completed, and `useCompleteOnboarding` writes the finished state into that entry so the next navigation is not sent back.
- **Steps** come from `welcomeSteps(goals)`: the profile step (the profile page's own `WorkExperienceSection`/`SkillsSection`) and the AI key step (`AddLlmApiKeyForm`, shared with Settings → AI) appear only for `AI_DOCUMENTS`/`ASSISTANT`. Every step can be skipped; "Skip setup" saves no goals.
- **The goals also filter the dashboard checklist** (`isRelevantToGoals`). No goals stored (skipped, or an account from before the flow, which the migration marked complete) shows every item.
- **`EmptyProfilePrompt`** stands in front of resume and cover-letter generation when the profile has no work experience and no skills. "Fill in profile" links to `/profile?returnTo=<here>`; the profile page shows a way back only for a value `sameOriginPath` (`lib/returnTo.ts`) accepts.
- **e2e:** `registerAndLogin` skips the flow; specs about the flow start from `registerToWelcome`.

## Account deletion and step-up (JEF-463)

- **Step-up dialog** (`settings/-components/useStepUpReauth.tsx`): on `STEP_UP_REQUIRED` it reads `me.stepUpMethods` first, then shows `StepUpPasswordForm` (password + TOTP) or `StepUpWithoutPassword` (Continue with Google, emailed code). Google is a full-page redirect to the API's `/auth/oauth/google/start?mode=reauth&ticket=…&returnTo=<this page>`; the call that asked cannot resume, so on return the hook reads `?stepUp=1`/`?stepUpError=…`, clears it and says whether to try again.
- **Danger Zone** asks for the account's email (not a password) and sends `requestAccountDeletion`; nothing is deleted until the mailed link is used.
- **Pages:** `/confirm-account-deletion` and `/cancel-account-deletion` take the mailed `token` and act only when the button is pressed (mail scanners open links). `/account-deletion-scheduled` is the full page a scheduled account is sent to by `/_authenticated`'s guard, which reads `deletionScheduledAt` from the same cached query as the verification wall (`lib/emailVerification.ts`).
- Email and backup-email changes hide the password field when `me.hasPassword` is false and send `currentPassword: null`; the API then wants a fresh session instead.

## Plans (JEF-344)

- **`PLAN_REQUIRED` is an upgrade prompt, not a failure.** `ErrorState` and `AiErrorMessage` branch on it, and the forms that can hit it (new application at the cap, share link) render `UpgradePrompt`. The text is the API's own message, which names the feature; the link goes to **Settings → Plan**.
- **`useBillingStatus()`** (`lib/billingStatus.ts`) is the one reader of `billingStatus`. Settings → Plan shows the plan, usage against each limit and a Free/Pro comparison built from the API's `catalogue`, so no limit is copied into the web app. Buying Pro arrives with billing (JEF-426).
- The web app uses inline query strings for this, like the storage card, so there is no `.graphql` file or codegen change.

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

## Server-side errors to PostHog (JEF-359, JEF-374)

The app is not static: nitro's `vercel` preset prerenders the marketing pages, but every other route runs in a Vercel function, as does the one server function `getRequiresCookieConsent`. Their errors go to the same PostHog project as the browser's, as `$exception` events (`$lib: trakwyn-web-server`, `source: server`), through `src/server/observability/`. The browser SDK cannot see them, so the server posts to PostHog's capture endpoint itself with `fetch`; `posthog-node` is not used, and `exceptionList.ts` ports the Node stack parser. Like the API (JEF-345), export is **production-only**: it needs `NODE_ENV=production` plus `VITE_POSTHOG_KEY`. Anywhere else each report goes to stdout only (and it always goes there too). These points are load-bearing:

- **Three capture points, because TanStack Start exposes no single one.** `src/server.ts` (a custom server entry) reads errored matches after load (`phase: 'load'`) and catches a failed document shell (`'shell'`). `src/start.ts`'s function middleware catches server functions, because their errors are serialised into a 500 before any outer layer sees a throw. Each report is deduplicated through a `WeakSet`, so a server function called from a loader is reported once.
- **A component that throws during SSR still answers 200.** Every route component sits in a Suspense boundary, so React reports the error only to the renderer's `onError`. TanStack forwards that to `console.error("Error in renderTo…")` and nothing else. `installRenderErrorCapture` watches for that one call (`'render'`), and a test reads the installed TanStack source so a change to it fails CI instead of silently stopping capture. The send runs mid-stream, so it is handed to Vercel's `waitUntil` (`vercelWaitUntil.ts`, a local copy of `@vercel/functions`' lookup). Adding a dependency to this package re-resolves its `latest`-pinned TanStack packages.
- **`src/start.ts` restates the CSRF middleware.** Declaring `requestMiddleware` replaces TanStack's built-in CSRF check for server functions instead of adding to it. `start.test.ts` fails if it is dropped.
- **A report holds the method, the path, Vercel's request id, and the scrubbed error.** It never holds the query string (this app's reset, verification and share tokens live there), cookies, `Authorization`, or a server function's input. Messages and stacks pass `scrubString` from `lib/analytics/scrub.ts`, the same redaction PostHog events get.
- **No person, no consent gate.** Server reports are operational error data sent without the browser's consent gate, so they identify no one: `$process_person_profile: false`, a `distinct_id` that is Vercel's request id (or random), `$geoip_disable`, and the project's `anonymize_ips`. The reasoning is in `infra/posthog/README.md` ("Server-side errors").
- **The key and host come from `import.meta.env`**, the values the browser bundle was built with, so server and client errors land in the same project. The `phc_` key is public; there is no server-only secret. The alert is set up by hand in PostHog (new and reopened issues, `infra/posthog/README.md`); `SERVER_LOG_EVENTS` reach it as `web_event`, so renaming one changes what a filtered alert matches.

## Tests

`gqlClient`- and router-mocked component tests live under `src/__tests__/components/`.
