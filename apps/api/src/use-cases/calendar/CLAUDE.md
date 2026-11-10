# Calendar sync (JEF-331)

Loaded when working in `use-cases/calendar/`. `GetCalendarEventsUseCase` here is the in-app month view and has nothing to do with the sync.

A user connects Google Calendar from Settings → Integrations, and each scheduled **interview round** is kept in their Google calendar. One way only: Trakwyn → Google. Applied and follow-up dates are not synced (the `sourceType` column is text, so they can be added later without a migration). Outlook is JEF-543.

## What it is not

- **Not AI.** Sync makes no LLM call and records no credit or usage. The chat assistant and MCP have no calendar tool and never touch Google. They change interview rounds like anyone else, and the sync follows that change. `calendarSyncBoundary.test.ts` fails if a sync file imports an LLM provider, the credit or quota services, or the entitlement service, or if the LLM tool catalogue or MCP mentions the calendar.
- **Not a Pro feature.** Free and Pro both connect and sync. There is no `PlanFeature` and no `assertFeature`.
- **Not part of the login OAuth flow.** `IOAuthProvider` only returns an identity; a calendar connection has to keep a token pair. Connecting uses `/auth/calendar/:provider/{start,callback}`, `CalendarOAuthStateService` and the `ICalendarProvider` port (OAuth and event CRUD together). The separate state type is deliberate: a Google _login_ state must not be replayable as a Google _calendar_ state.

## Fail-open sync

`SyncCalendarEventUseCase` is called after the write commits, on the same path as the change, and **never throws**. A Google outage, a revoked token or a failed refresh is logged and the save still succeeds. It is the one calendar use case with no GraphQL mutation. Only `ConnectCalendarUseCase` and `DisconnectCalendarUseCase` throw `CalendarProviderError` (502), because there the user asked for the calendar action and is waiting on the answer.

- `execute({ userId, sourceType, sourceId, event })` creates, updates, or with `event: null` removes the event on every connected calendar. Each connection fails on its own; one bad calendar does not skip another.
- `removeMany({ userId, sourceType, sourceIds })` removes the events of sources that no longer exist. It refreshes the access token once per connection, and one failing event does not strand the rest.
- `CalendarSyncedEvent` maps a Trakwyn record to the external event id, unique on connection + source type + source id. It cascades from the connection, so a disconnect cannot leave rows behind. It does **not** cascade from interview rounds (the source id is plain text), which is why deleting a round has to remove its event explicitly.

## Where sync runs

| Change                                        | Where                                                                                                   |
| --------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| Interview round created, edited, date cleared | `interviewRounds/Create…`, `Update…`, `DeleteInterviewRoundUseCase`, through `interviewCalendarEvent()` |
| Application **permanently** deleted           | `jobs/PermanentlyDeleteApplicationUseCase` only                                                         |
| A confirmed chat proposal or an MCP write     | Nothing extra: both call the interview round use cases above                                            |
| Application created, edited, bulk-updated     | **Not hooked.** Phase 1 syncs interviews only                                                           |
| Application moved to Trash, or restored       | **Not hooked.** Trash is reversible and leaves Google alone                                             |

`PermanentlyDeleteApplicationUseCase` is the single place that destroys an application: "Delete permanently", Empty Trash and the nightly purge all call it. Hook there, not in the callers. It reads the round ids **before** the delete (the rounds cascade with the application), then calls `removeMany` after it.

`calendarSyncBoundary.test.ts` holds this list: a new caller of `syncCalendarEventUseCase` has to be added there on purpose.

## Tokens

Access and refresh tokens are encrypted in `DrizzleCalendarConnectionRepository`, with the same `ILlmApiKeyCipher` and `LLM_API_KEY_ENCRYPTION_KEY` as users' LLM keys (one secret to manage; the name is historical). Each ciphertext is bound to `calendar:<userId>:<provider>:<access|refresh>`, so a value copied onto another row fails to decrypt. The domain entity always holds plaintext; tokens are never returned through GraphQL. Rotating the encryption key breaks stored LLM keys **and** calendar connections together.

## Modes and credentials

- `CALENDAR_PROVIDER_MODE=fake` swaps Google for `FakeGoogleCalendarProvider` and a same-origin consent page (`fakeCalendarConsent.routes.ts`), like `OAUTH_PROVIDER_MODE=fake`. `.env.example` sets it for local dev. It is **not** the code default: unset means the real provider.
- Real mode needs `GOOGLE_CALENDAR_CLIENT_ID` and `GOOGLE_CALENDAR_CLIENT_SECRET` (a separate OAuth client from the sign-in one, scope `calendar.events`). Without them, `/start` redirects to Settings with `calendarError=not_configured` rather than showing a bare JSON error.
- No Google app is registered yet, so nothing has run against the live API. That is a follow-up on JEF-331.

## Adding Outlook or application dates

- **Outlook (JEF-543):** add a member to `CalendarProvider`, a provider class registered in `CalendarProviderRegistry`, and its fake branch. Sync already loops over every connection.
- **Application dates:** add the source type to `CalendarSyncSourceType`, call `execute` from the application use cases, and decide what a Trash move does for them. No migration.
