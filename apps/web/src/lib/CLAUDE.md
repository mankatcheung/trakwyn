# Session gates, plans and quotas

Loaded when working under `apps/web/src/lib`. The rest of the web notes are in `apps/web/CLAUDE.md`. Paths are relative to `apps/web/src/` unless stated.

## Email verification wall (JEF-438)

- **The guard is `beforeLoad` on `/_authenticated`**, which awaits `checkEmailVerification()` and redirects an unverified account to `/verify-email-required`, a full-page route outside the layout. It has to be a `beforeLoad` and not a component wrapped around the layout: child route loaders (the dashboard's `queryClient.query`) run regardless and the API refuses each one, so the error boundary would replace the page before a component gate rendered. The cookie check stays synchronous and first. A failed check lets the user through, because the API enforces the wall itself (`apps/api/src/use-cases/auth/CLAUDE.md`); the guard is the polite layer.
- **One request answers the whole guard (JEF-535).** `beforeLoad` calls `checkSessionGate()` (`lib/sessionGate.ts`), a single `SessionGate` query for `me { emailVerified deletionScheduledAt onboardingCompletedAt onboardingGoals }`. It writes the answer into the verification and onboarding cache keys below, and skips the request when both are still fresh. The guard also starts the dashboard's four queries (`prefetchDashboard`) without waiting for the gate; the loader joins those in-flight requests, so a verified user's first paint is gated by about two waves, not four. A redirect wastes the prefetch, which is the price of the common case. The chat dock fetches conversations, keys and billing only once it is used (open window, or a pinned pill).
- **One request per session once verified.** `lib/emailVerification.ts` caches the answer under one query key, with an infinite `staleTime` once verified and 10 s while not. The wall page refetches on window focus, so verifying in another tab sends the user on to `/dashboard`; `/verify-email-required` itself redirects a verified user there, so it is never a dead end.
- The page offers resend (a 60 s cooldown, a "wait a few minutes" message on `RATE_LIMITED`, a spam-folder hint), "I've verified", a different email (the `requestEmailChange` mutation, which needs the password) and sign out. Registering signs the user in, so the register confirmation links to `/dashboard`, not `/login` (which would only bounce them there).

## First-run welcome flow (JEF-460)

- **The guard is the second half of `/_authenticated`'s `beforeLoad`**: after the email check passes, `checkOnboarding()` (`lib/onboarding.ts`) reads `me.onboardingCompletedAt` and `needsWelcome` sends a user who has never finished or skipped the flow to `/welcome`. `/welcome`, `/profile`, `/settings/*` and `/oauth` are exempt, because the flow links to them and they would bounce back. A failed check lets the user through: the flow is an offer, not a wall. `/welcome` itself sends a finished user to `/dashboard`.
- **One request per session once finished,** like the email check: the answer is cached under `ONBOARDING_STATE_KEY` with an infinite `staleTime` once completed, and `useCompleteOnboarding` writes the finished state into that entry so the next navigation is not sent back.
- **Steps** come from `welcomeSteps(goals)`: the profile step (the profile page's own `WorkExperienceSection`/`SkillsSection`) and the AI key step (`AddLlmApiKeyForm`, shared with Settings → AI) appear only for `AI_DOCUMENTS`/`ASSISTANT`. Every step can be skipped; "Skip setup" saves no goals.
- **The goals also filter the dashboard checklist** (`isRelevantToGoals`). No goals stored (skipped, or an account from before the flow, which the migration marked complete) shows every item.
- **`EmptyProfilePrompt`** stands in front of resume and cover-letter generation when the profile has no work experience and no skills. "Fill in profile" links to `/profile?returnTo=<here>`; the profile page shows a way back only for a value `sameOriginPath` (`lib/returnTo.ts`) accepts.
- **e2e:** `registerAndLogin` skips the flow; specs about the flow start from `registerToWelcome`.

## Plans (JEF-344)

- **`PLAN_REQUIRED` is an upgrade prompt, not a failure.** `ErrorState` and `AiErrorMessage` branch on it, and the forms that can hit it (new application at the cap, share link) render `UpgradePrompt`. The text is the API's own message, which names the feature; the link goes to **Settings → Plan**.
- **`useBillingStatus()`** (`lib/billingStatus.ts`) is the one reader of `billingStatus`. Settings → Plan shows the plan, usage against each limit and a Free/Pro comparison built from the API's `catalogue`, so no limit is copied into the web app. Buying Pro arrives with billing (JEF-426).
- **Locked previews (JEF-523).** `LockedFeaturePreview` (`components/`) replaces a Pro-only section for a Free user: a blurred, fictional sample, an "Available on Pro" badge and a link to Settings → Plan, which fires `upgrade_clicked {source: 'locked_preview', feature}`. It is shown only when `useFeatureLocked(feature)` is true, i.e. `billingStatus.features[feature]` is `false`, so it never shows while status loads or where plans are not enforced. The Offers page uses the card. Analytics uses `LockedFeatureOverlay`, which covers the whole page: `LockedAnalyticsSample` (fictional numbers, blurred, `inert`) with one sticky message card over it, so none of the user's real figures sit beside the lock and the gated queries never fire. `notifications` is deliberately not previewed: the API exposes the flag but gates nothing on it, so Free users still get reminders. `ApplicationCapNotice` (applications list) is the soft heads-up between 80% of the application limit and the cap, read from `billingStatus`, not `contentQuota`.

## Content quotas (JEF-494)

The API's per-resource ceilings (`contentQuota`, `apps/api/src/use-cases/quotas/CLAUDE.md`) show at each create control.

- **One reader, one component.** `lib/contentQuota.ts` holds the inline `ContentQuota` query and `useQuotaState(resource, used?)`; `components/QuotaHint.tsx` renders it. Per-application resources pass `used` (the tab already holds the list), per-user ones omit it and read the API's count. The limits are never copied into the app.
- **Silent below 80%,** "9 of 10 notes" from 80%, and at the cap an alert that names the limit. The create control is disabled at the cap (`useQuotaState(...)?.level === 'full'`), and it stays enabled while the limit is unknown, so a slow query never blocks a create.
- **A create that loses the race** shows the API's own message (`getErrorMessage` passes `QUOTA_EXCEEDED` through) next to the control. Do not swallow a create error with `console.error`.
- **A component that renders a `QuotaHint` needs a `QueryClientProvider`,** and its request shares the test's `gqlClient` mock; suites about something else stub `#/lib/contentQuota` (see `NewApplicationPage.test.tsx`).
- Where the application cap is hit, the new-application form adds a note that Trash still counts until it is purged.
