# Settings: AI, hosted AI and account deletion

Loaded when working under `apps/web/src/routes/_authenticated/settings`. The rest of the web notes are in `apps/web/CLAUDE.md`. Paths are relative to `apps/web/src/` unless stated.

## Which AI answers (JEF-503)

- **One ordered list replaces the source picker, "make default" and the fall-through checkbox.** `AiProviderOrderCard` (`routes/_authenticated/settings/-components/`) lists `me.aiProviderOrder`, tried first to last, with move up, move down and remove on each row and an "add" button for every saved key (and Trakwyn AI on a plan that has it) that is not listed. Each change saves the whole list with `setAiProviderOrder`. The last provider cannot be removed, since an empty list would mean no AI. `aiProviderOrder.ts` holds the pure list helpers, tested without a renderer.
- **The list is what can run, not what was saved.** The API returns it without entries that could not run today, so the card never shows a provider the call would skip. Where the data goes is spelled out per row ("Your messages go to OpenAI", "Uses your monthly credits").
- **The chat says what answers now.** `routes/_authenticated/assistant/-runsOn.ts` is the one place that decides it, from the first entry of the order that can run (Trakwyn AI cannot on a plan without it), for the header, the history page and the dock picker. A chat is not locked to the key it started on, so the provider stored on the conversation is only the answer while the order is unknown or empty. Nothing is shown until the settings load, and for an order that leads with Trakwyn AI until billing status does too, so a row never flashes a provider that is about to change. A new chat is created with no provider.
- **The notice names either side of a switch.** `providerEntryLabel` turns an order entry (`trakwyn` or a key id) into a name. The SSE `fallback` event now also covers failures during the call, not only a limit.
- The queries are inline strings in `routes/_authenticated/settings/-components/shared.ts` and no `.graphql` document reads these fields, so there is no codegen change. The deprecated `aiSource`, `defaultLlmProvider` and `llmFallbackWhenLimited` are no longer read here.
- Mobile mirrors this (`AiProviderOrderCard`, `AiCreditsCard`, `settings/lib/aiProviderOrder.ts`, and a notice in `ChatScreen`).

## Hosted AI in the UI (JEF-451)

- **Pro-only for now:** `useHostedAiAvailable()` (`lib/aiCredits.ts`) is false when the plan has no credits (`limit` and `bonusRemaining` are 0). Free then sees no meter and no credits card, and nothing to add Trakwyn AI to the provider order with, the old "add an API key" empty states and checklist item, and a "Trakwyn AI is included with Pro" note in Settings → AI; Free shows "Not included" in the credits rows. The hook is `null` while billing status loads.
- **Credits** come from `billingStatus.aiCredits` (`useBillingStatus`); `lib/aiCredits.ts` turns them into "left of total" (the welcome bonus is spent last). `AiCreditsMeter` shows it always in Settings → AI and Plan, as a one-line hint in the assistant header only below 30% left, and as an always-on inline line above the chat composer for a user whose next turn runs on Trakwyn AI (JEF-511; `ChatConversationView` re-reads it after every turn, failed or not).
- **Which AI answers** is the provider order card (Settings → AI, JEF-503, above), not a source picker. The assistant no longer blocks on "add an API key": with none, the API answers with Trakwyn AI, and `AI_NOT_CONFIGURED` still renders the add-key copy when an instance has hosted AI off.
- **`AiErrorMessage`** handles `AI_CREDITS_EXHAUSTED` (the API's message names the reset date; Upgrade and Add your own key links, with `ai_credits_exhausted_shown`, `ai_upgrade_clicked`, `ai_add_key_clicked`), `EMAIL_NOT_VERIFIED` and `AI_TEMPORARILY_UNAVAILABLE` (not emitted by the API yet).
- The pricing page's credit figures are checked against `PLAN_LIMITS` in `PricingPage.test.tsx`.

## Account deletion and step-up (JEF-463)

- **Step-up dialog** (`routes/_authenticated/settings/-components/useStepUpReauth.tsx`): on `STEP_UP_REQUIRED` it reads `me.stepUpMethods` first, then shows `StepUpPasswordForm` (password + TOTP) or `StepUpWithoutPassword` (Continue with Google, emailed code). Google is a full-page redirect to the API's `/auth/oauth/google/start?mode=reauth&ticket=…&returnTo=<this page>`; the call that asked cannot resume, so on return the hook reads `?stepUp=1`/`?stepUpError=…`, clears it and says whether to try again.
- **Danger Zone** asks for the account's email (not a password) and sends `requestAccountDeletion`; nothing is deleted until the mailed link is used.
- **Pages:** `/confirm-account-deletion` and `/cancel-account-deletion` take the mailed `token` and act only when the button is pressed (mail scanners open links). `/account-deletion-scheduled` is the full page a scheduled account is sent to by `/_authenticated`'s guard, which reads `deletionScheduledAt` from the same cached query as the verification wall (`lib/emailVerification.ts`).
- Email and backup-email changes hide the password field when `me.hasPassword` is false and send `currentPassword: null`; the API then wants a fresh session instead.
