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

The profile page's "Import from CV" button opens `CvImportDialog` (`routes/_authenticated/profile/-components/`): choose a file, read it, review the entries, save the ticked ones. The API side is in `apps/api/src/use-cases/profile/CLAUDE.md`.

- **The upload is a plain `fetch`, not `gqlClient`** (`lib/cvImport.ts`): multipart to `CV_IMPORT_URL`, derived from `VITE_API_URL` like the chat stream's. It sends `credentials: 'include'`, the required `x-trakwyn-upload` header (the API's CSRF guard, which must match its constant) and no `Content-Type`, so the browser adds the multipart boundary. The vite dev proxy has an entry for `/profile/cv-import`, which is exact enough not to catch the web app's own `/profile` routes.
- **A 401 is refreshed and retried once** through an ordinary GraphQL call, since a plain `fetch` has no refresh of its own and the access token is short-lived; if the refresh fails, `gqlClient` has already signed the user out.
- **The file is checked in the browser first** (type, `.doc`, empty, 10 MB) so a wrong file is turned away with no request. The input's `accept` lists extensions as well as types because some systems report no type for `.docx`; `resolveCvMimeType` retypes the part from the extension for the same reason. The API repeats every check.
- **Review state is plain data** (`cvImportDrafts.ts`): rows start ticked unless the profile already has them (`alreadyInProfile`), a ticked row that has been edited into something invalid blocks Import, and only ticked rows are sent. Save guards a double click with a ref, because the API would add every row twice.
- **No `.graphql` file or codegen:** the confirm mutation is an inline string in `profileQueries.ts`, like the rest of the profile.

## Email verification wall (JEF-438)

- **The guard is `beforeLoad` on `/_authenticated`**, which awaits `checkEmailVerification()` and redirects an unverified account to `/verify-email-required`, a full-page route outside the layout. It has to be a `beforeLoad` and not a component wrapped around the layout: child route loaders (the dashboard's `ensureQueryData`) run regardless and the API refuses each one, so the error boundary would replace the page before a component gate rendered. The cookie check stays synchronous and first. A failed check lets the user through, because the API enforces the wall itself (`apps/api/src/use-cases/auth/CLAUDE.md`); the guard is the polite layer.
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

## Hosted AI in the UI (JEF-451)

- **Pro-only for now:** `useHostedAiAvailable()` (`lib/aiCredits.ts`) is false when the plan has no credits (`limit` and `bonusRemaining` are 0). Free then sees no meter and no credits card, and nothing to add Trakwyn AI to the provider order with, the old "add an API key" empty states and checklist item, and a "Trakwyn AI is included with Pro" note in Settings → AI; Free shows "Not included" in the credits rows. The hook is `null` while billing status loads.
- **Credits** come from `billingStatus.aiCredits` (`useBillingStatus`); `lib/aiCredits.ts` turns them into "left of total" (the welcome bonus is spent last). `AiCreditsMeter` shows it always in Settings → AI and Plan, as a one-line hint in the assistant header only below 30% left, and as an always-on inline line above the chat composer for a user whose next turn runs on Trakwyn AI (JEF-511; `ChatConversationView` re-reads it after every turn, failed or not).
- **Which AI answers** is the provider order card (Settings → AI, JEF-503, below), not a source picker. The assistant no longer blocks on "add an API key": with none, the API answers with Trakwyn AI, and `AI_NOT_CONFIGURED` still renders the add-key copy when an instance has hosted AI off.
- **`AiErrorMessage`** handles `AI_CREDITS_EXHAUSTED` (the API's message names the reset date; Upgrade and Add your own key links, with `ai_credits_exhausted_shown`, `ai_upgrade_clicked`, `ai_add_key_clicked`), `EMAIL_NOT_VERIFIED` and `AI_TEMPORARILY_UNAVAILABLE` (not emitted by the API yet).
- The pricing page's credit figures are checked against `PLAN_LIMITS` in `PricingPage.test.tsx`.

## Which AI answers (JEF-503)

- **One ordered list replaces the source picker, "make default" and the fall-through checkbox.** `AiProviderOrderCard` (`settings/-components/`) lists `me.aiProviderOrder`, tried first to last, with move up, move down and remove on each row and an "add" button for every saved key (and Trakwyn AI on a plan that has it) that is not listed. Each change saves the whole list with `setAiProviderOrder`. The last provider cannot be removed, since an empty list would mean no AI. `aiProviderOrder.ts` holds the pure list helpers, tested without a renderer.
- **The list is what can run, not what was saved.** The API returns it without entries that could not run today, so the card never shows a provider the call would skip. Where the data goes is spelled out per row ("Your messages go to OpenAI", "Uses your monthly credits").
- **The chat says what answers now.** `assistant/-runsOn.ts` is the one place that decides it, from the first entry of the order that can run (Trakwyn AI cannot on a plan without it), for the header, the history page and the dock picker. A chat is not locked to the key it started on, so the provider stored on the conversation is only the answer while the order is unknown or empty. Nothing is shown until the settings load, and for an order that leads with Trakwyn AI until billing status does too, so a row never flashes a provider that is about to change. A new chat is created with no provider.
- **The notice names either side of a switch.** `providerEntryLabel` turns an order entry (`trakwyn` or a key id) into a name. The SSE `fallback` event now also covers failures during the call, not only a limit.
- The queries are inline strings in `settings/-components/shared.ts` and no `.graphql` document reads these fields, so there is no codegen change. The deprecated `aiSource`, `defaultLlmProvider` and `llmFallbackWhenLimited` are no longer read here.
- Mobile mirrors this (`AiProviderOrderCard`, `AiCreditsCard`, `settings/lib/aiProviderOrder.ts`, and a notice in `ChatScreen`).

## Content quotas (JEF-494)

The API's per-resource ceilings (`contentQuota`, `apps/api/src/use-cases/quotas/CLAUDE.md`) show at each create control.

- **One reader, one component.** `lib/contentQuota.ts` holds the inline `ContentQuota` query and `useQuotaState(resource, used?)`; `components/QuotaHint.tsx` renders it. Per-application resources pass `used` (the tab already holds the list), per-user ones omit it and read the API's count. The limits are never copied into the app.
- **Silent below 80%,** "9 of 10 notes" from 80%, and at the cap an alert that names the limit. The create control is disabled at the cap (`useQuotaState(...)?.level === 'full'`), and it stays enabled while the limit is unknown, so a slow query never blocks a create.
- **A create that loses the race** shows the API's own message (`getErrorMessage` passes `QUOTA_EXCEEDED` through) next to the control. Do not swallow a create error with `console.error`.
- **A component that renders a `QuotaHint` needs a `QueryClientProvider`,** and its request shares the test's `gqlClient` mock; suites about something else stub `#/lib/contentQuota` (see `NewApplicationPage.test.tsx`).
- Where the application cap is hit, the new-application form adds a note that Trash still counts until it is purged.

## Error reporting and analytics

PostHog is off by default, autocapture and replay are off, and every event is scrubbed. The rules and the Terraform split are in `src/lib/analytics/CLAUDE.md`; the server-side half (Vercel function errors) is in `src/server/CLAUDE.md`. Read them before adding an event, a PostHog setting or a server error path.

## Tests

`gqlClient`- and router-mocked component tests live under `src/__tests__/components/`.
