# apps/web — TanStack Start + React Query + GraphQL

Loaded when working under `apps/web`. The cross-cutting conventions are in the root `CLAUDE.md`. Rules for data, writes and forms: `src/CLAUDE.md`.

## Structure

- **Routing:** file-based under `src/routes/` (`@tanstack/react-router`).
  - `/` redirects.
  - `/login` and `/register` are public.
  - `/_authenticated/*` is the protected layout. Its `beforeLoad` redirects to `/login`, then runs one `SessionGate` query that sends an unverified account to `/verify-email-required`, a scheduled deletion to `/account-deletion-scheduled` and a new user to `/welcome`.
  - It holds `dashboard` and `applications/*`. Why it is a `beforeLoad` and what each redirect exempts: `src/lib/CLAUDE.md`.
- **Styling:** Tailwind v4 via `@tailwindcss/vite`. Shared components come from `packages/ui` (`@trakwyn/ui`, Storybook).
- **Path alias:** `#/*` maps to `./src/*`.
- **Dev proxy:** Vite proxies `/graphql` to `http://localhost:3001`, so `VITE_API_URL` defaults to `/graphql`.

## Data and auth

- **Client:** `gqlClient` (`graphql-request`, `src/graphql/client.ts`) with TanStack Query. It sends `credentials: 'include'` and keeps no token in JS; the browser attaches the HttpOnly cookies. Its `responseMiddleware` refreshes and retries on `UNAUTHORIZED`, then redirects to `/login` if the refresh fails.
- **Session detection:** `hasSessionCookie()` does a synchronous `document.cookie` read of the non-HttpOnly `trakwyn_logged_in` hint. It is used by `/`, `/login` and `/_authenticated`. These routes set **`ssr: false`**, because TanStack Start does not re-run `beforeLoad` on hydration otherwise. The cookie deploy prerequisites are in `apps/api/CLAUDE.md`.
- **Codegen:** after changing `.graphql` files or the API schema, run `pnpm codegen` (the API must be running). **Never edit `src/graphql/generated/` by hand.**

## Where the detail lives

Each file loads only when you work in its directory. Read it before changing that code.

- `src/CLAUDE.md`: reading data, writes and forms.
- `src/lib/CLAUDE.md`: the email verification wall, the first-run welcome flow, plans and locked previews, content quotas.
- `src/lib/analytics/CLAUDE.md`: PostHog events, scrubbing and the Terraform split.
- `src/server/CLAUDE.md`: Vercel function errors.
- `src/routes/_authenticated/settings/CLAUDE.md`: which AI answers, hosted AI credits, account deletion and step-up.
- `src/routes/_authenticated/profile/CLAUDE.md`: CV import.
- `e2e/CLAUDE.md`: marketing screenshots and guide scripts.

## Error reporting and analytics

PostHog is off by default, autocapture and replay are off, and every event is scrubbed. The rules and the Terraform split are in `src/lib/analytics/CLAUDE.md`; the server-side half (Vercel function errors) is in `src/server/CLAUDE.md`. Read them before adding an event, a PostHog setting or a server error path.

## React Compiler (JEF-610)

The compiler runs in dev, the build and Vitest (`reactCompiler.ts`, shared by `vite.config.ts` and `vitest.config.ts`) in `infer` mode: it memoizes every component and hook it can prove safe and skips the rest without failing the build.

- **No new `useMemo`, `useCallback` or `memo`** unless a comment says why (a value read by non-React code, a third-party prop that needs a stable identity). Existing ones stay until a follow-up PR removes them area by area.
- **The `react-hooks` lint rules are the compiler's rules** (`recommended` preset). A component that breaks one is skipped. Fix it, or opt out with `'use no memo'` as the first statement and a comment on the reason, plus a scoped `eslint-disable` for that rule (the plugin still reports in opted-out code). Current opt-outs: `useDebouncedCallback`, `useInfiniteScrollSentinel`, `CaptchaWidget`, `DocumentDraftEditor` (ref written or read during render), `NotificationPopover` (`window.location.href` in a handler).
- `react-hooks/set-state-in-effect` is a warning, not an error: the compiler does not skip a component for it, and the existing mount-time effects are left alone.
- To compile only components marked `'use memo'`, set `COMPILATION_MODE` to `annotation` in `reactCompiler.ts`.

## Concurrent React (JEF-611)

- **Navigation → `useTransition`** with an async callback (`ApplicationDetailPage` section switch): the old view stays live and `isPending` marks the nav busy.
- **Local filtering of a list already in memory → `useDeferredValue`**, input bound to the live value. None yet: search here drives server queries.
- **Input that triggers a request or an autosave → debounce.** A deferred value sends every request.
- **State worth keeping across views → `<Activity>`** (`SectionPanes`: opened once, then hidden, not unmounted). Hidden drops effects, so queries stop refetching.

## Deprecated APIs (JEF-615)

Calling a `@deprecated` API fails lint (`no-deprecated`, which makes lint type-aware). Loaders use `queryClient.query({ ...options, staleTime: 'static' })`, which serves the cache like `ensureQueryData` did; without `staleTime` it refetches stale data on every navigation.

## Tests

`gqlClient`- and router-mocked component tests live under `src/__tests__/components/`.
