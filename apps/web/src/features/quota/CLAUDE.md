# Content quotas (JEF-494)

Loaded when working under `apps/web/src/features/quota`. The rest of the web notes are in `apps/web/CLAUDE.md`. Paths are relative to `apps/web/src/` unless stated.

The API's per-resource ceilings (`contentQuota`, `apps/api/src/use-cases/quotas/CLAUDE.md`) show at each create control.

- **One reader, one component.** `features/quota/lib/contentQuota.ts` holds the inline `ContentQuota` query and `useQuotaState(resource, used?)`; `features/quota/components/QuotaHint.tsx` renders it. Per-application resources pass `used` (the tab already holds the list), per-user ones omit it and read the API's count. The limits are never copied into the app.
- **Silent below 80%,** "9 of 10 notes" from 80%, and at the cap an alert that names the limit. The create control is disabled at the cap (`useQuotaState(...)?.level === 'full'`), and it stays enabled while the limit is unknown, so a slow query never blocks a create.
- **A create that loses the race** shows the API's own message (`getErrorMessage` passes `QUOTA_EXCEEDED` through) next to the control. Do not swallow a create error with `console.error`.
- **A component that renders a `QuotaHint` needs a `QueryClientProvider`,** and its request shares the test's `gqlClient` mock; suites about something else stub `#/features/quota/lib/contentQuota` (see `NewApplicationPage.test.tsx`).
- Where the application cap is hit, the new-application form adds a note that Trash still counts until it is purged.
