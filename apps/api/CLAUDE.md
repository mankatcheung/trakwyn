# apps/api — subsystem notes

Loaded when working under `apps/api`. The layer map, DI shape and cross-cutting conventions are in the root `CLAUDE.md`. Paths below are relative to `apps/api/src/` unless stated.

## Where the rest lives

Each of these loads on its own when you work in its directory. Paths are under `src/`.

| Directory                              | Topics                                                                                        |
| -------------------------------------- | --------------------------------------------------------------------------------------------- |
| `use-cases/auth/`                      | account deletion and step-up, the email verification wall, captcha and sign-up/sign-in limits |
| `interface-adapters/mcp/`              | the MCP server: protocol, tool annotations, scopes, call limits, write attribution            |
| `use-cases/chat/`                      | chat write proposals the user confirms                                                        |
| `infrastructure/storage/`              | storage providers, document links, quotas, the two Blob stores, the ATS score                 |
| `use-cases/documents/`                 | draft history: snapshots, the cap, restore                                                    |
| `use-cases/profile/`                   | CV import                                                                                     |
| `use-cases/mockInterviewQuestions/`    | practice questions tailored to the candidate, talking points                                  |
| `use-cases/plans/`                     | plans and entitlements, hosted AI credits                                                     |
| `use-cases/quotas/`                    | content quotas                                                                                |
| `infrastructure/billing/`              | Polar billing, webhooks, known gaps                                                           |
| `infrastructure/email/`                | email providers and verification-mail abuse limits                                            |
| `infrastructure/observability/`        | Axiom/OTel, metrics, LLM cost, use-case spans                                                 |
| `infrastructure/llm/`                  | hosted AI provider, reasoning tokens, spend guards, model circuits, model tiers               |
| `use-cases/user/`                      | AI provider order                                                                             |
| `use-cases/coverLetter/`               | the grounding guard that refuses a letter naming an employer, credential, number or link      |
| `use-cases/jobDescription/`            | cheaper AI calls: JSON-LD, posting cache, match reuse                                         |
| `use-cases/companyBriefing/`           | company briefing: the company's own site, web search, sources, the research caches            |
| `use-cases/prompts/`                   | prompt modules and versions                                                                   |
| `docs/ai-data-handling.md` (repo root) | where AI-related user data goes and which code backs each privacy-policy claim (JEF-549)      |
| `evals/`                               | running and extending the AI evals                                                            |

## Auth

- **Cookies for every client.** Access and refresh tokens are the HttpOnly cookies `trakwyn_access_token` and `trakwyn_refresh_token`. Every auth entry point sets or clears them through `setAuthCookies()`/`clearAuthCookies()` (`http/schema/types/AuthPayloadType.ts`): login, register, TOTP, refresh, reauthenticate, logout, the OAuth callback and delete-account. Cookies are `SameSite=None; Secure`.
- **Bearer fallback.** `buildGraphQLContext.ts` accepts `Authorization: Bearer` when no cookie is present (`cookieToken ?? bearerToken`), for non-cookie clients such as API tokens and the browser extension.
- **`trakwyn_logged_in` hint cookie** (`COOKIES.LOGGED_IN`). It is non-HttpOnly, has the refresh token's lifetime and is what the web app reads to detect a session (see `apps/web/CLAUDE.md`). It only needs to be directionally correct.
- **Deploy prerequisite:** `COOKIE_DOMAIN` must be the shared registrable domain with a leading dot (`.trakwyn.com`). Without it the cookies are host-only on `api.`, the hint is invisible to `www.`, and login "succeeds" while session detection fails.
- **Deploy prerequisite:** `CORS_ORIGIN` must contain the web app's exact origin. `corsPlugin.ts` validates `credentials: true` requests against it, and a mismatch silently breaks cookie delivery. The plugin sets no `allowedHeaders`, which is what lets the clients' `traceparent` through; adding a list without it breaks trace propagation.
- **Mobile** uses `*Mobile` mutations (`http/schema/mutations/mobileAuthMutations.ts`) that return both tokens in the body. `DeviceLabelService` turns the mobile User-Agent into the session label.
- **The browser extension** uses the same `*Mobile` mutations and keeps both tokens in `browser.storage.session` (JEF-383), plus the refresh token alone in `browser.storage.local` when the user ticks "Keep me signed in" (JEF-421), which is why the session lifetime has an absolute cap (below). Its Google/GitHub sign-in is the mobile handoff with a different destination, and `exchangeMobileOAuthCode` redeems it:
  - **Chrome:** `/auth/oauth/:provider/start?platform=extension&codeChallenge=…&extensionId=…` redirects the handoff code to `https://<id>.chromiumapp.org/`. Only IDs in `EXTENSION_OAUTH_IDS` are accepted, and the ID is checked again at the callback, so the redirect host never rests on the cookie alone.
  - **Safari** (no `identity` API, JEF-386): `platform=extension-tab` needs no extension ID. It redirects to this API's own `ROUTES.EXTENSION_OAUTH_DONE`, a static no-store page the extension watches its sign-in tab for. The code is bound to the PKCE challenge, so seeing the URL is not enough to redeem it. CORS allows `safari-web-extension://` origins (`EXTENSION_ORIGIN_SCHEMES`).

## Session revocation

Access tokens are otherwise stateless, so every revocation also writes the `sid` to a blocklist that `AuthenticateRequestUseCase` checks. The writes live in `BlocklistingSessionRepository`, a decorator over `DrizzleSessionRepository` (the same inner/outer DI shape as `Cached*Repository`), so no call site has to remember. The store is Redis or an in-process map, chosen by `CACHE_PROVIDER`. **It fails open:** a store error means "not revoked" (at most the 15-minute token lifetime), and the DB `revokedAt` is still enforced at refresh.

**Session lifetime (JEF-422).** A session slides forward 7 days (`SESSION.TTL_MS`) on every refresh, and `SESSION.ABSOLUTE_TTL_MS` (90 days from `createdAt`) caps that. `RotateRefreshTokenUseCase` refuses a refresh past the cap with the same `UNAUTHORIZED` as an expired session (no revocation, no reuse log) and clamps the new `expiresAt` to it in all three branches (normal, grace window, legacy adoption). Without it a refresh token that keeps being used, or a stolen one whose owner stopped refreshing so reuse is never seen, never expires. A session already older than the cap is signed out at its next refresh.

## Database

- **Drivers:** `DATABASE_URL`'s scheme picks the driver in `infrastructure/db/createDb.ts`. `postgres://` uses a `pg` pool; `pglite:<dir>` or `pglite:memory` runs PGlite in-process. Local dev uses `pglite:./.pglite` (one process at a time), CI e2e uses Postgres 17 and tests use in-memory PGlite. Repositories are typed against `DrizzleDb`/`DrizzleTransaction`.
- **Production** is Neon (`aws-eu-central-1`, Free plan, 0.25 CU, scales to zero after 5 minutes; compute and branch in `infra/neon`). The API uses the **pooled** URL (Secret Manager `database-url`); migrations use the **direct** URL (`PRODUCTION_DATABASE_URL`), since the pooler runs in transaction mode. Stay on `pg`, not `@neondatabase/serverless`, which cannot run the interactive transactions. Pool policy is `DATABASE` in `infrastructure/config/constants.ts`, and the pool's `'error'` handler keeps Neon's idle-socket closes from crashing the process.
- **Schema** is `infrastructure/db/schema.ts`: timestamps are `timestamptz(3)` (`schema/columns.ts`); salaries and `monthlyTokenLimit` are `bigint`. `pnpm db:generate` writes into `drizzle/` (baseline `0000_postgres_baseline`). `applyMigrations.ts` applies them in one transaction under an advisory lock.
- **Transactions are ambient (JEF-427).** `ITransactionManager.run` stores the transaction in `AsyncLocalStorage`, and every `Drizzle*Repository` reads it through `getClient(db)`, so a use case never passes a handle. A use case whose writes must stand or fall together (several repositories, or a token marked used plus what it unlocks) wraps them in `runInTransaction(this.deps.transactionManager, …)` (`use-cases/runInTransaction.ts`; the dependency is optional so mock-repository unit tests need no manager). Rules: a throw out of the callback rolls back everything in it, so **security side effects that must survive a refusal (token-family revocation, reuse events) stay outside it**, and the callback returns a value instead of throwing (see the two MCP token use cases); email, storage and LLM calls stay outside too. A new repository must use `getClient` (`repositoryTransactions.test.ts`), and a new multi-write use case gets a rollback test in `useCaseTransactions.test.ts`, which uses the real repositories because mocks cannot show a rollback.
- **Postgres gotchas:** `LIKE` is case-sensitive (use `ilike`); cast a bare parameter inside `CASE` (`${index}::integer`); `count`/`sum` come back as `number`, but `numeric` (`avg`, `sum` over `bigint`) stays a string.
- `src/copyFromTurso.ts` and `infrastructure/db/copyToPostgres.ts` are the one-off Turso copy. Delete them, and their `dependencyRule.test.ts` root exemption, once Turso is retired.

## Deployment

Cloud Run `europe-west1` (web stays on Vercel, whose project is Terraform in `infra/vercel/`, JEF-363). The GCP side is Terraform in `infra/gcp/`, whose `README.md` is the runbook. Terraform owns config; CI owns releases (`deploy-api` builds `apps/api/Dockerfile` from the repo root and authenticates through WIF, which trusts only `main`, so `terraform plan` is run by hand rather than on PRs). CI's `migrate-db` runs migrations before the deploy; they are not in the image.

- **The image is pruned after `pnpm deploy --prod`.** drizzle-orm's optional peers (Prisma, PGlite, libSQL, TypeScript, …) get linked in and drag ~400 MB of packages the API never imports, so `docker/prune-store.mjs` cuts every drizzle-orm peer except `pg`, `@types/pg`, `@opentelemetry/api` and `@upstash/redis`, then deletes whatever in `node_modules/.pnpm` is no longer reachable, and fails the build if a package it kept has a broken link. The Dockerfile also strips `*.d.ts` (the `.js.map` files stay for `--enable-source-maps`) and `dist/evals`. A new runtime dependency on one of the cut peers needs adding to `KEPT_DRIZZLE_PEERS`.
- **A deploy is tested before it takes traffic (JEF-476).** `deploy-api` deploys the image as a tagged revision with `no_traffic`, calls `.github/scripts/smoke-test.sh api` against the revision's own `https://<tag>---<service>-…run.app` URL (`GET /ready`, then `POST /graphql { __typename }`), and only then runs `gcloud run services update-traffic --to-latest` and removes the tag. A revision that fails never serves anyone and the old one keeps running. `GET /ready` (`http/routes/ready.routes.ts`) runs `select 1` through the pool and answers 503 with no reason in the body (the cause is logged); `GET /health` stays a static answer because it is Cloud Run's startup probe. Neither is traced as a cold start (`TRACING.STARTUP_PROBE_PATH`, `READINESS_PATH`). The script is tested against a local server in `smokeTest.test.ts`, and the job order in `ciWorkflow.test.ts`.
- **Migrations must work with the code on both sides.** `migrate-db` runs before the new image ships, and a failed deploy leaves the old revision serving against the new schema. Add a column, table or index in one release and remove or rename what the old code reads in a later one (expand, then contract); never drop or rename in the same PR that stops using it.
- **Runs on main are queued, not parallel.** `ci.yml` serializes pushes to main and replaces a queued run with a newer one, so two quick merges cannot deploy at once and an older commit cannot finish last. Because of that a push to main never skips a job on the files it touched; only pull requests do (`changes`), and `ci-ok` is the one required check.
- **`notify-deploy` reports failures too** (ntfy, high priority, with the failed jobs and the run link). The web deploy is checked against the repository variable `WEB_URL` and rolled back with `vercel rollback` to the deployment that was live before it.
- **Request-based billing throttles CPU once no request is in flight**, so work that must finish is awaited before the response: the telemetry flush in `buildApp.ts`'s `onResponse`, and the new-device alert in `CreateSessionUseCase`. There are no in-process timers or schedulers.
- **`/admin/*` jobs** are driven by Cloud Scheduler with a Google **OIDC ID token** (JEF-336). `cronAuth.ts` verifies it via `IOidcTokenVerifier` (`GoogleOidcTokenVerifier`) and requires `aud` = `API_ORIGIN` and `email` = `CRON_INVOKER_SA`. `CRON_SECRET`/`DIGEST_ADMIN_SECRET` exist only for manual triggers. With none of the three configured, a route answers 503.
- **Logs** reach Axiom's `AXIOM_LOGS_DATASET` through `otelLogDestination.ts` (teed to stdout). On SIGTERM, `http/gracefulShutdown.ts` drains within `SHUTDOWN.SERVER_CLOSE_TIMEOUT_MS`, inside Cloud Run's 10 s grace period.

## Client compatibility

Some clients cannot be updated on demand: a mobile build in the stores, and a Clipper installed from the Chrome Web Store. A store release cannot be rolled back, only replaced; review and slow auto-update leave old versions in use for days to weeks. So the API is not changed the way a web-only schema is.

- **The rule:** a field, mutation, argument, input field or enum value that a shipped Clipper or mobile version uses is not removed, renamed or changed incompatibly without a deprecation window. Incompatible means a removed or renamed name, a narrower input type, a new _required_ argument or input field, a changed output type, or a new value the client's code does not handle.
- **The way through:** add the new shape beside the old one, mark the old one deprecated (Pothos `deprecationReason`), keep it working, and remove it only once the versions that use it are out of use. Mobile versions are in PostHog by `$app_version`, and Clipper versions by `release` on the Clipper health dashboard (`infra/posthog/README.md`). A new optional argument is always safe.
- **The `*Mobile` mutations are the extension's contract** (`loginMobile`, `refreshTokenMobile`, `exchangeMobileOAuthCode` and the rest of `mobileAuthMutations.ts`), as well as mobile's. They return both tokens in the body because those clients have no cookie jar; do not fold them into the web mutations. Error codes a client maps to its own copy (`AI_NOT_CONFIGURED`, `RATE_LIMITED`, `UNAUTHORIZED`, …) are part of the contract too: a client that does not know a new code falls back to a generic message, so add codes, and do not repurpose one.
- **What guards it:** `apps/extension/src/__tests__/graphqlDocuments.test.ts` validates every Clipper document against this schema, using `pnpm --filter @trakwyn/api schema:print` (`http/schema/printSchema.ts`: the Pothos schema as SDL, with no database or port), and mobile's integration tier does the same against a booted API. Each fails on a removed or renamed field or argument. Neither can see a behaviour change (a different error code, a changed default), so those need the deprecation window by hand. The extension's test is part of `pnpm test`, and `apps/extension/turbo.json` lists `apps/api/src/http` as an input, so an API-only change re-runs it instead of reusing Turbo's cached result.

## Testing

Vitest.

- **Infrastructure tests:** `createTestDb()`, a real in-memory PGlite with migrations applied.
- **Integration tests:** `buildTestApp()`, which gives each call its own database.
- **Use-case tests:** the per-domain mocks in `__tests__/helpers/mocks/<domain>.ts` (cross-cutting doubles are in `infrastructure.ts`). Placement is enforced by `mockPlacement.test.ts`.
- **Resolver tests:** under `__tests__/interface-adapters/resolvers/`.
