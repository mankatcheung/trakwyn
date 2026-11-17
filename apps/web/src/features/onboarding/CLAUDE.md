# First-run welcome flow (JEF-460)

Loaded when working under `apps/web/src/features/onboarding`. The rest of the web notes are in `apps/web/CLAUDE.md`. Paths are relative to `apps/web/src/` unless stated.

- **The guard is the second half of `/_authenticated`'s `beforeLoad`**: after the email check passes, `checkOnboarding()` (`features/onboarding/lib/onboarding.ts`) reads `me.onboardingCompletedAt` and `needsWelcome` sends a user who has never finished or skipped the flow to `/welcome`. `/welcome`, `/profile`, `/settings/*` and `/oauth` are exempt, because the flow links to them and they would bounce back. A failed check lets the user through: the flow is an offer, not a wall. `/welcome` itself sends a finished user to `/dashboard`.
- **One request per session once finished,** like the email check: the answer is cached under `ONBOARDING_STATE_KEY` with an infinite `staleTime` once completed, and `useCompleteOnboarding` writes the finished state into that entry so the next navigation is not sent back.
- **Steps** come from `welcomeSteps(goals)`: the profile step (the profile page's own `WorkExperienceSection`/`SkillsSection`) and the AI key step (`AddLlmApiKeyForm`, shared with Settings → AI) appear only for `AI_DOCUMENTS`/`ASSISTANT`. Every step can be skipped; "Skip setup" saves no goals.
- **The goals also filter the dashboard checklist** (`isRelevantToGoals`). No goals stored (skipped, or an account from before the flow, which the migration marked complete) shows every item.
- **`EmptyProfilePrompt`** stands in front of resume and cover-letter generation when the profile has no work experience and no skills. "Fill in profile" links to `/profile?returnTo=<here>`; the profile page shows a way back only for a value `sameOriginPath` (`features/auth/lib/returnTo.ts`) accepts.
- **e2e:** `registerAndLogin` skips the flow; specs about the flow start from `registerToWelcome`.
