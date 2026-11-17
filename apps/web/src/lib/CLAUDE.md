# Session gates, plans and quotas

Loaded when working under `apps/web/src/lib`. The detail moved next to the code it describes (JEF-634), and each file loads when you work in that feature. Paths are relative to `apps/web/src/`.

- `features/verification/CLAUDE.md`: the email verification wall, and the `beforeLoad` on `/_authenticated` that runs it.
- `features/onboarding/CLAUDE.md`: the first-run welcome flow and the dashboard checklist goals.
- `features/plans/CLAUDE.md`: `PLAN_REQUIRED`, `useBillingStatus` and locked previews.
- `features/quota/CLAUDE.md`: content quotas and `QuotaHint`.
- `lib/analytics/CLAUDE.md`: PostHog events and scrubbing.

This file stays because `apps/mobile/CLAUDE.md` links to it.
