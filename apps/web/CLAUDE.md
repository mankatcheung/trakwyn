# apps/web — TanStack Start + React Query + GraphQL

Loaded when working under `apps/web`. The cross-cutting conventions are in the root `CLAUDE.md`. Rules for data, writes and forms: `src/CLAUDE.md`.

## Structure

- **Routing:** file-based under `src/routes/` (`@tanstack/react-router`).
  - `/` redirects.
  - `/login` and `/register` are public.
  - `/_authenticated/*` is the protected layout. Its `beforeLoad` redirects to `/login`, then runs one `SessionGate` query that sends an unverified account to `/verify-email-required`, a scheduled deletion to `/account-deletion-scheduled` and a new user to `/welcome`.
  - It holds `dashboard` and `applications/*`. Why it is a `beforeLoad` and what each redirect exempts: `src/features/verification/CLAUDE.md`.
- **Styling:** Tailwind v4 via `@tailwindcss/vite`. Shared components come from `packages/ui` (`@trakwyn/ui`, Storybook).
- **Path alias:** `#/*` maps to `./src/*`.
- **Dev proxy:** Vite proxies `/graphql` to `http://localhost:3001`, so `VITE_API_URL` defaults to `/graphql`.

## Data and auth

- **Client:** `gqlClient` (`graphql-request`, `src/graphql/client.ts`) with TanStack Query. It sends `credentials: 'include'` and keeps no token in JS; the browser attaches the HttpOnly cookies. Its `responseMiddleware` refreshes and retries on `UNAUTHORIZED`, then redirects to `/login` if the refresh fails.
- **Session detection:** `hasSessionCookie()` does a synchronous `document.cookie` read of the non-HttpOnly `trakwyn_logged_in` hint. It is used by `/`, `/login` and `/_authenticated`. These routes set **`ssr: false`**, because TanStack Start does not re-run `beforeLoad` on hydration otherwise. The cookie deploy prerequisites are in `apps/api/CLAUDE.md`.
- **Codegen:** after changing `.graphql` files, a `graphql()` document or the API schema, run `pnpm codegen` (the API must be running), then `pnpm exec prettier --write src/graphql/generated`. **Never edit `src/graphql/generated/` by hand.** CI holds `generated/` to the API schema (JEF-651): `pnpm codegen:check` prints the schema with the API's `schema:print` (no running API, database or port), points codegen at it through `CODEGEN_SCHEMA`, formats and fails on a validation error or any diff in `generated/`. Run it locally before pushing an API schema change. The untyped `REFRESH_MUTATION` string in `graphql/client.ts` is not covered.
- **Typed documents (JEF-637):** write a query as `graphql(`query Name { … }`)` (import from `#/graphql/generated`) next to the `queryOptions` that use it, not as a template-literal string. Codegen reads `src/**/*.{ts,tsx,graphql}`, validates every document against the schema (a field that does not exist fails `pnpm codegen`) and types `gqlClient.request` through `ResultOf`. **Operation names must be unique across the whole app** (`Applications` already exists, so the dashboard's is `DashboardApplications`). **Mock `gqlClient.request` with `mockGql` (JEF-652):** `mockGql(mockGqlRequest, [respond(DOCUMENT, data), respondError(OTHER, error)])` from `src/__tests__/helpers/gqlMock.ts` answers by operation name (`respondWith` holds a typed response open until the test releases it, and `overrideGql` changes one operation over a `mockResolvedValue(defaultResponse)` set in `beforeEach`), types `data` (and the variables of a `(variables) => data` function) from the document, so a changed selection fails `pnpm typecheck`, and rejects an operation nobody mocked with an error naming it. `webStructure.test.ts` fails on a test that answers a mocked client with `gqlText(query).includes(…)`; the files still to move are in `HAND_ROLLED_GQL_MOCKS`, a list that can only shrink, so move a test onto the helper whenever you touch it. Assertions on the call use `gqlContaining`, and `gqlText` stays for call filters. Assertions on the document argument use `gqlContaining('Name')` instead of `expect.stringContaining` (`gqlText` and `gqlContaining` are in `src/__tests__/helpers/gqlText.ts`, and both read strings and typed documents). The API schema leaves fields nullable, so wrap a selection in `Resolved<T, 'nullableKey'>` (`src/graphql/resolved.ts`) and assert it at the `queryFn`, as `features/dashboard/graphql/dashboardQueries.ts` does.
  - **Call `gqlClient.request(DOC, vars)` with no type argument** and cast the awaited result (`as { … }`); an explicit `request<T>` fights the document's own type.
  - **A query with a parameter** gets a key factory and an `xQueryOptions(id)` next to its document (`features/interviews/graphql/interviewRoundQueries.ts`), so the loader, the component and the cache edits share one key.
  - **A form field that maps to an API enum** uses `z.enum` over its values, so the variables type-check against the input type.
  - **`showUndoToast` takes a typed document** and prints it, because what it stores and replays after a refresh is text.
  - **An enum input takes the enum's name** (`OFF`), not the value the API reads back (`off`), so a variable typed from the schema needs a map from the UI value (`DIGEST_FREQUENCY_INPUT` in `SettingsNotificationsPage`).
  - **Every document is typed.** No `.graphql` file and no inline `query`/`mutation` template literal is left, except `REFRESH_MUTATION` in `graphql/client.ts`: it is the client's own token-refresh call, and routing it through the generated documents would make the client depend on its own output. `webStructure.test.ts` fails on a new one (JEF-646).

## Folder layout (JEF-627)

`src/` has one folder per feature, like `apps/mobile`.

| Kind of file                                                          | Where it goes                                                              |
| --------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| A route (`createFileRoute`, loader, `beforeLoad`)                     | `routes/`, kept thin: it renders a page                                    |
| A route-only helper                                                   | `routes/…/-name.ts(x)` (the `-` prefix hides it from the router)           |
| A page and what only it uses                                          | `features/<name>/pages/`, `components/`, `hooks/`, `lib/`                  |
| A GraphQL document                                                    | a `graphql()` call in `features/<name>/graphql/<name>Queries.ts` (JEF-637) |
| Used by more than one feature                                         | the shared root: `components/`, `hooks/`, `lib/`                           |
| A test                                                                | `__tests__/` beside the code it tests                                      |
| A test of the whole app or the config (route tree, parity, structure) | `src/__tests__/{config,content,guides,routes}/`                            |

Rules, held by `src/__tests__/config/webStructure.test.ts`:

- A feature folder holds only `pages`, `components`, `hooks`, `lib`, `graphql`, `__tests__` and a `CLAUDE.md`.
- A route imports only `features/*/pages/*`, `features/*/graphql/*` (a loader needs the query options), the shared root and `graphql/`. A page the route needs only to render something (`RootOverlays`, `DashboardPending`) lives in `pages/` too.
- The shared root never imports `features/`. A feature may import the shared root and another feature's `lib/` or `components/`.
- No `features/**/index.ts` barrel files. Import from the file that defines it.
- A source file is at most 400 lines, the API's limit (generated files and tests are exempt), with no exceptions list (JEF-636).

`pnpm build && pnpm --filter @trakwyn/web check:chunks` fails if a route that had a chunk of its own in `scripts/chunk-baseline.json` has none. Rewrite the baseline with `pnpm check:chunks --record` after a build, only when a route is added or removed on purpose.

## Where the detail lives

Each file loads only when you work in its directory. Read it before changing that code.

- `src/CLAUDE.md`: reading data, writes and forms.
- `src/lib/CLAUDE.md`: an index of the four below (`apps/mobile/CLAUDE.md` links to it).
- `src/features/verification/CLAUDE.md`: the email verification wall.
- `src/features/onboarding/CLAUDE.md`: the first-run welcome flow.
- `src/features/plans/CLAUDE.md`: plans and locked previews.
- `src/features/quota/CLAUDE.md`: content quotas.
- `src/lib/analytics/CLAUDE.md`: PostHog events, scrubbing and the Terraform split.
- `src/server/CLAUDE.md`: Vercel function errors.
- `src/features/settings/CLAUDE.md`: which AI answers, hosted AI credits, account deletion and step-up.
- `src/features/profile/CLAUDE.md`: CV import.
- `e2e/CLAUDE.md`: marketing screenshots and guide scripts.

## Error reporting and analytics

PostHog is off by default, autocapture and replay are off, and every event is scrubbed. The rules and the Terraform split are in `src/lib/analytics/CLAUDE.md`; the server-side half (Vercel function errors) is in `src/server/CLAUDE.md`. Read them before adding an event, a PostHog setting or a server error path.

## Hooks and Fast Refresh (JEF-639)

Fast Refresh only hot-swaps a file that exports nothing but components, so a component file that also exports a hook reloads the page and loses state. Put an exported hook in its own `use*.ts` file in `hooks/` (the feature's, or the shared root's when more than one feature uses it), not in a component file. `react-refresh/only-export-components` (`eslint.config.mjs`) holds this for components outside route modules; a provider that must export its hook, or a helper that cannot move yet, carries a scoped `eslint-disable` with a reason. Route modules are exempt.

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

Tests live in a `__tests__/` folder beside the code they test (`features/profile/components/sections/__tests__/ProfileSections.test.tsx`). `gqlClient`- and router-mocked component tests follow the same rule. Tests of the app as a whole stay under `src/__tests__/{config,content,guides,routes}/`: a `__tests__/` folder inside `routes/` would be read as a route segment.
