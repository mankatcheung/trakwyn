# apps/mobile — Expo Router + React Query + GraphQL

Loaded when working under `apps/mobile`. The cross-cutting conventions are in the root `CLAUDE.md`.

## Structure

- **Routing:** Expo Router, file-based under `app/`.
  - `app/_layout.tsx` waits for auth to restore, then picks `(app)` or `(auth)` with `Stack.Protected`.
  - `(auth)` holds `login` and `register`.
  - `(app)` holds `index` (the applications list); `applications/new`, `[id]`, `[id]/edit`, `[id]/notes`, `[id]/documents` and `trash`; `conversations` and `conversations/[id]` (`id` is `new` for an unsaved thread); and `settings/{profile,security,notifications,ai}`.
- **Route files are thin re-exports** of screens in `src/features/*/screens/` or `src/screens/`. Screens use `expo-router` hooks directly rather than navigation props. Static titles are set in `(app)/_layout.tsx`; only screens that need runtime data, such as `ApplicationsListScreen`, set `<Stack.Screen options>` inline.
- **No path alias:** imports are relative (`../src/...` from `app/`).

## Auth transport

- **Tokens:** the `*Mobile` mutations return both tokens in the body. The pair is stored as **one JSON value under one SecureStore key** (`src/auth/tokenStorage.ts`) so it can't be half-updated, which the API would read as refresh-token reuse. The access token is also held in memory.
- **Refresh:** `gqlRequest` (`src/graphql/client.ts`) refreshes once and retries on `UNAUTHORIZED`, but only if the request carried a token.
  - Pass `{ refreshOnUnauthorized: false }` where `UNAUTHORIZED` means "wrong password" (`updatePassword`, `reauthenticateMobile`).
  - A refresh that can't reach the server keeps the tokens. Only a rejected refresh token ends the session, and ending it (like sign-out) clears the React Query cache.
- **Non-GraphQL callers** (the chat SSE stream) use `getValidAccessToken()` and `recoverFromUnauthorized()`.
- **User-Agent:** `TrakwynMobile/<version> (<model>; <os>)`, which the API turns into the session label.
- **Step-up:** `STEP_UP_REQUIRED` is handled by `src/auth/useStepUpReauth.tsx`.
- **`expo start --web` is a dev preview only.** It keeps tokens in `localStorage`; shipping it would first require switching to the cookie mutations.

## Error reporting (JEF-349)

The same rules as web (`apps/web/CLAUDE.md`), with these differences:

- **Off by default:** nothing is sent without `EXPO_PUBLIC_POSTHOG_KEY`.
- **No autocapture:** `<PostHogProvider autocapture>` is not mounted.
- **Scrubber:** `lib/analytics/scrub.ts` is kept in parity with web's copy.
- **No consent gate:** there is no banner in a native app; the scrubber is what makes that acceptable.
- **Native crashes** are captured by `@posthog/react-native-plugin`. It is a **plain dependency, not an Expo config plugin**, and adding it to `app.json` `plugins` breaks `expo start`. It works only in dev/EAS builds, not Expo Go.
- **Breadcrumbs** (`addBreadcrumb`) cover token refresh, SecureStore failures, chat-stream reopens and navigation. Navigation is recorded with `useSegments()` (e.g. `/(app)/applications/[id]`), never `usePathname()`, so no identifiers leak.
- **Network context (JEF-367):** `NetworkBreadcrumbs` records NetInfo's `connected`/`reachable`/`type` on change only, never `details` (SSID, IP, carrier), and feeds `$network_connected` on every event. `gqlRequest` and the token refresh time out after `GQL_REQUEST_TIMEOUT_MS` with a `RequestTimeoutError` (a `TypeError`, so it reads as a network failure). `chatStream.ts` breadcrumbs error frames (code only), a close before `done` and a mid-reply drop, with elapsed time and whether text had arrived.
