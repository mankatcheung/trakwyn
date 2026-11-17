# Data, writes and forms (JEF-612)

Loaded when working under `apps/web/src`. The rules for any component that reads data, writes data or has a form. The cross-cutting web conventions are in `apps/web/CLAUDE.md`.

### Reading data: TanStack Query, always

| Situation                                                                                                       | Use                                                                                                                                      |
| --------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| A page's main data (dashboard, applications list, board, trash, detail, offers, calendar, analytics, assistant) | A route `loader` with `queryClient.query({ ...xxxQueryOptions, staleTime: 'static' })`, and `useQuery(xxxQueryOptions)` in the component |
| Secondary data (a panel, a card, a tab)                                                                         | `useQuery` only                                                                                                                          |
| Data needed only after the user acts (an open dialog, the chat dock)                                            | `useQuery` with `enabled`                                                                                                                |
| A read that gates navigation (session, email verification, onboarding)                                          | `beforeLoad` plus a helper that writes into the cache (`lib/sessionGate.ts`)                                                             |

- **Define each query once** with `queryOptions({ queryKey, queryFn })` and share it between the loader and the component. Give each distinct query its own key, even when two widgets read similar data (a shared key once served the dashboard's stale result to the calendar page).
- **Catch an error the page should show itself in the loader** (`PLAN_REQUIRED` in `offers.tsx`). An uncaught loader error replaces the whole app, sidebar included.
- **No `gqlClient.request` for a read in a component body or effect.** No `ensureQueryData` (deprecated, lint fails).

### Writing data

| Situation                                                                                                                                                  | Use                                                                                    |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| The write changes data some query shows (applications, profile, settings, keys, documents, offers, contacts, interviews)                                   | **`useMutation`** with invalidation in `onSuccess`. A form action calls `mutateAsync`. |
| Auth and one-off flows with nothing cached (login, register, forgot and reset password, step-up, account-deletion confirm and cancel, resend verification) | A direct `gqlClient.request` is fine                                                   |
| Optimistic update or undo                                                                                                                                  | `useMutation` with `onMutate` and rollback                                             |

- **No hand-written `invalidateQueries` after a direct call.** If a write needs invalidation, it is a mutation.
- **Show an error from one place:** `mutation.error` (when the page already renders it, as `ProfileSection` does with `createError`) or the action's `state.error`. In the first case the action catches the rejection and returns nothing.
- **Plain `fetch`** only where GraphQL cannot do the job: chat SSE (`lib/chatStream.ts`), CV import multipart (`lib/cvImport.ts`), signed-URL uploads, OAuth consent, the VAPID key, the GraphQL client's own refresh. A new one needs a comment saying why.

### Forms

| The form                                                      | Use                                                                                                                                |
| ------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| Has a field that can fail validation, **even a single field** | **react-hook-form + zod**, submitted with `useFormAction` and `SubmitButton`                                                       |
| Has no real fields (approve or deny, confirm, trigger)        | **`useActionState`** reading `FormData`, with `SubmitButton`. Tell several buttons apart with `name`/`value` (`McpAuthorizePage`). |
| A button that fires a request, outside any form               | No form: a `useMutation` and its `isPending`                                                                                       |
| A client-only edit with no request (the editor link field)    | Local `useState`                                                                                                                   |

- **Always a real `<form>` element.** Never submit from a button's `onClick` (Enter would not submit and `useFormStatus` would not work), and never define a form component inside another component's render.
- **Not in new code:** `onSubmit` with `preventDefault`, `useState(false)` for pending, `formState.isSubmitting`, `form.setError('root')` for a server error.
- **Read values with `useWatch({ control, name })`, not `form.watch()`.** `watch` is incompatible with the React Compiler and forced `AddLlmApiKeyForm` to opt out.
- **`SubmitButton` (`@trakwyn/ui`) reads the form's status** with `useFormStatus`: it disables itself, shows a spinner and the `pendingLabel`, and sets `aria-busy`. A disabled default button also stops Enter from submitting again, so a double click or double Enter reaches the action once. `pending` forces the look for a form still on `onSubmit`.
- **`useFormAction(form, submit)`** (`lib/useFormAction.ts`) wraps `form.handleSubmit` in `useActionState`. `submit` runs only when the schema validates and returns the error message to show (or null), or `{ message, code }` when the form must tell a plan error from a failure (`NewApplicationPage` renders `UpgradePrompt` for `state.code`); `state.error` is rendered as `{state.error && <Alert>…`. Spread `formProps` on the `<form>`.
- **React resets a form's fields after an action, which breaks react-hook-form.** The DOM goes blank while react-hook-form keeps the old values, so a failed save would lose what the user typed. `formProps.ref` cancels that with a native `reset` listener. It has to be native and on a stable ref: React calls `form.reset()` itself during commit and never fires `onReset` for it, and a ref callback re-created each render is detached just before the reset. A form that wants a blank slate after success calls `resetFields(values)`, the second argument of `submit`: `form.reset(values)` alone leaves the DOM as it was in a real browser, so `resetFields` also lets one native reset through.
- **A form born before its data arrives** (a settings form fed by a query) gets a `key` that changes when the data loads (`ProfileDetailsForm`, `CustomAiPromptForm`). A react-hook-form `values` update after mount resets the form natively, and the reset-cancelling listener above stops that from reaching the fields.
- **Out of scope for form actions:** drag and drop, toggles, bulk actions, the chat composer (`ChatConversationView`, a stream).

### Still to convert (follow-up PRs under JEF-612)

Forms still on `onSubmit` or plain state, and writes still on direct calls where cached data changes:

1. Plain-`useState` forms with real fields: `OfferForm`, the `VerifyEmailRequiredPage` change-email form, `InterviewQuestionsPanel`, `MockQuestionsPanel`.
2. Single-field forms, to react-hook-form: `ResumeGapsPanel`, the `StepUpWithoutPassword` code form, `InlineAiForm`, `SettingsDangerZonePage`, `DocumentEditorLinkForm`.
3. `ContactsTab` and `InterviewsTab` (no `<form>`, form component defined in render; remove their compiler opt-outs).
4. `offers/index.tsx`, `JdImportPanel`, `LlmApiKeyRow` (writes on direct calls).
