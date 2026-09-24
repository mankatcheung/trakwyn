# apps/api — subsystem notes

Loaded when working under `apps/api`. The layer map, DI shape and cross-cutting conventions are in the root `CLAUDE.md`. Paths below are relative to `apps/api/src/` unless stated.

## Auth

- **Cookies for every client.** Access and refresh tokens are the HttpOnly cookies `trakwyn_access_token` and `trakwyn_refresh_token`. Every auth entry point sets or clears them through `setAuthCookies()`/`clearAuthCookies()` (`http/schema/types/AuthPayloadType.ts`): login, register, TOTP, refresh, reauthenticate, logout, the OAuth callback and delete-account. Cookies are `SameSite=None; Secure`.
- **Bearer fallback.** `buildGraphQLContext.ts` accepts `Authorization: Bearer` when no cookie is present (`cookieToken ?? bearerToken`), for non-cookie clients such as API tokens. The browser extension reads the access cookie via `chrome.cookies.get()`.
- **`trakwyn_logged_in` hint cookie** (`COOKIES.LOGGED_IN`). It is non-HttpOnly, has the refresh token's lifetime and is what the web app reads to detect a session (see `apps/web/CLAUDE.md`). It only needs to be directionally correct.
- **Deploy prerequisite:** `COOKIE_DOMAIN` must be the shared registrable domain with a leading dot (`.trakwyn.com`). Without it the cookies are host-only on `api.`, the hint is invisible to `www.`, and login "succeeds" while session detection fails.
- **Deploy prerequisite:** `CORS_ORIGIN` must contain the web app's exact origin. `corsPlugin.ts` validates `credentials: true` requests against it, and a mismatch silently breaks cookie delivery. The plugin sets no `allowedHeaders`, which is what lets the clients' `traceparent` through; adding a list without it breaks trace propagation.
- **Mobile** uses `*Mobile` mutations (`http/schema/mutations/mobileAuthMutations.ts`) that return both tokens in the body. `DeviceLabelService` turns the mobile User-Agent into the session label.

## Session revocation (JEF-164)

Access tokens are otherwise stateless, so every revocation also writes the `sid` to a blocklist that `AuthenticateRequestUseCase` checks. The writes live in `BlocklistingSessionRepository`, a decorator over `DrizzleSessionRepository` (the same inner/outer DI shape as `Cached*Repository`), so no call site has to remember. The store is Redis or an in-process map, chosen by `CACHE_PROVIDER`. **It fails open:** a store error means "not revoked" (at most the 15-minute token lifetime), and the DB `revokedAt` is still enforced at refresh.

## MCP server

`POST /mcp` (`http/routes/mcp.routes.ts`) is JSON-RPC 2.0, protocol `2024-11-05`, POST-only with no SSE or session handling. The route owns transport and auth; protocol logic lives in `interface-adapters/mcp/McpController.ts`.

- **Auth:** `AuthenticateMcpRequestUseCase` accepts API tokens of either scope (`read`/`full`) and rejects JWTs. GraphQL's `AuthenticateRequestUseCase` requires `full`, so a `read` token reaches MCP only. Every tool is scoped to the caller's `userId`.
- **Access tags (JEF-176):** each tool is `access: 'read' | 'write'`. `tools/list` hides write tools from `read` tokens, and `tools/call` **refuses** them (the refusal is the security boundary). The tag is stripped before it goes over the wire.
- **Catalogue:** `interface-adapters/llm/toolCatalogue.ts` (JEF-177). `use-cases/` never imports it; `ChatWithAssistantUseCase` gets `chatTools` injected. `http/di` decides exposure: `MCP_TOOLS` is the whole catalogue, and chat gets `CHAT_TOOLS` (reads only, since chat has no scope to gate on).
- **When adding a tool,** add it to `TOOL_CATALOGUE` _and_ to the `tools/call` switch of every surface that exposes it. The parity tests catch a tool that is advertised but not handled.

## Storage

`STORAGE_PROVIDER` is `local` (disk, dev) or `vercel-blob` (prod). The upload flow is `requestUploadUrl`, then the client uploads directly, then `confirmDocument`.

- Blob returns a client token for `@vercel/blob/client`'s `put()`.
- Local returns a URL under `/uploads/_upload/*` (registered in `buildApp.ts` when `STORAGE_PROVIDER === 'local'`). Web's `DocumentsTab` detects `/_upload/` and `PUT`s to it with `fetch`. `corsPlugin.ts` lists `PUT` explicitly for this.
- Local read-back is `GET /uploads/*` through `LocalStorageProvider.openObject`, which refuses keys outside `uploads/`. It is unauthenticated and deliberately not on `IStorageProvider` (JEF-343).

## Email

`EMAIL_PROVIDER` is `brevo` (the default) or `console`. `ConsoleEmailService` logs each mail, including its confirm/reset URL. `BrevoEmailService` throws on a blank key, and mail-dependent flows (`RequestEmailChangeUseCase` and friends) surface that as a 500. Only `RegisterUseCase`'s verification send is best-effort.

## Database (JEF-342)

- **Drivers:** `DATABASE_URL`'s scheme picks the driver in `infrastructure/db/createDb.ts`. `postgres://` uses a `pg` pool; `pglite:<dir>` or `pglite:memory` runs PGlite in-process. Local dev uses `pglite:./.pglite` (one process at a time), CI e2e uses Postgres 17 and tests use in-memory PGlite. Repositories are typed against `DrizzleDb`/`DrizzleTransaction`.
- **Production** is Neon (`aws-eu-central-1`, scales to zero). The API uses the **pooled** URL (Secret Manager `database-url`); migrations use the **direct** URL (`PRODUCTION_DATABASE_URL`), since the pooler runs in transaction mode. Stay on `pg`, not `@neondatabase/serverless`, which cannot run the interactive transactions. Pool policy is `DATABASE` in `infrastructure/config/constants.ts`, and the pool's `'error'` handler keeps Neon's idle-socket closes from crashing the process.
- **Schema** is `infrastructure/db/schema.ts`: timestamps are `timestamptz(3)` (`schema/columns.ts`); salaries and `monthlyTokenLimit` are `bigint`. `pnpm db:generate` writes into `drizzle/` (baseline `0000_postgres_baseline`). `applyMigrations.ts` applies them in one transaction under an advisory lock.
- **Postgres gotchas:** `LIKE` is case-sensitive (use `ilike`); cast a bare parameter inside `CASE` (`${index}::integer`); `count`/`sum` come back as `number`, but `numeric` (`avg`, `sum` over `bigint`) stays a string.
- `src/copyFromTurso.ts` and `infrastructure/db/copyToPostgres.ts` are the one-off Turso copy. Delete them, and their `dependencyRule.test.ts` root exemption, once Turso is retired.

## Observability (JEF-129)

- **Axiom via OTel** (`infrastructure/observability/tracing.ts`), **production only** (JEF-345): `isObservabilityEnabled` needs `NODE_ENV=production` plus `AXIOM_TOKEN`/`AXIOM_DATASET`. Metrics also need `AXIOM_METRICS_DATASET`.
- **The SDK starts from a preload** (JEF-346): `node --import ./dist/instrumentation.js dist/index.js`. ESM hoists imports and only the `import-in-the-middle` loader can patch `graphql`/`pg`/`ioredis`/`undici`/`http`. Do not move the start into `index.ts`.
- **Root span:** it is renamed to `POST /graphql <op>` (`graphqlOperationSpanName.ts`, via a Mercurius `preExecution` hook). `formatError` marks it `ERROR` with `error.type` for server faults only (not `NOT_FOUND` or a wrong password), and **never with a message**, since Drizzle errors embed query parameters.
- **Cold starts** (JEF-357): `coldStart.ts` sets `faas.coldstart` and `app.process_uptime_ms` on a process's first real request, skipping `/health`. The process runs with `--enable-source-maps`.
- **Metrics:** counters live in `infrastructure/observability/metrics.ts` behind `IMetrics` and are created lazily (a meter obtained before `startObservability()` is a permanent no-op). Test them with `makeFakeMetrics()` (`__tests__/helpers/fakeMetrics.ts`). They cover:
  - cache hit/miss (`InstrumentedCache`)
  - Redis fail-open and circuit-breaker transitions for cache, rate limiter and session blocklist. Those paths degrade silently, so the counter is the only signal.
  - `trakwyn.email.sent` by `template`/`outcome`. The Brevo error keeps status and `code` only, never the body (JEF-356).
  - `trakwyn.llm.calls` and the `trakwyn.llm.duration` histogram (ms) by `provider`/`model`/`operation`/`outcome`/`error_kind`, and `trakwyn.llm.tokens` by `provider`/`direction` (JEF-113).
- **LLM calls (JEF-113):** `TracingLLMProvider` wraps the raw provider beneath `UsageTrackingLLMProvider` in `UserLLMProviderFactory.resolveForUser`. It is applied only to tracked calls (never key tests) and only when DI passes `traceLlmCalls: isObservabilityEnabled`. Each call gets one `llm.complete`/`llm.stream` client span carrying `gen_ai.provider.name` (the current name for `gen_ai.system`), `gen_ai.request.model`, `gen_ai.usage.input_tokens`/`output_tokens`, `app.llm.cache_read_tokens`/`cache_write_tokens`/`estimated`/`outcome`, and for streams `app.llm.time_to_first_token_ms`. A stream's span stays open across iteration, but its latency metric stops at `done`. A consumer that stops early is `aborted`, not `error`. A provider refusal is `ERROR` with `app.llm.error_kind` from `LlmProviderError.kind`. **No prompt, message, tool result or completion text is recorded**: an error that is not an `LlmProviderError` contributes only its class name (`error.type`), since its message could quote the response.
- **Logged events:** `oidc.jwks_unavailable` (as distinct from a forged token) and `cron.auth.rejected` with `reason`.
- **Security events (JEF-354):** `LoggingSecurityEventRepository`, a decorator over `DrizzleSecurityEventRepository`, emits one `security.<eventType>` line and increments `trakwyn.security.events`. The level is `warn` for `SUSPICIOUS_SECURITY_EVENT_TYPES`. Lines carry `userId` and `eventType` only, **never the IP or user agent**.
- **Failed sign-ins:** logged as `auth.login.failed`/`auth.totp.failed` (`logAuthFailure.ts`). An unknown email and a wrong password are both `invalid_credentials` with no user id, so the log can't be used to enumerate accounts.
- **Alerting** is Terraform in `infra/axiom/` (JEF-355; see its `README.md`). **Renaming a `METRICS.*` name, an `ADMIN_JOBS` entry or a log line's `event` field means updating `infra/axiom/monitors.tf` in the same PR.**

## Use-case spans (JEF-347)

`traceUseCase` (`infrastructure/observability/tracedUseCase.ts`) wraps each use case's `execute()` in a `<ClassName>.execute` span. On error it records the exception and the `DomainError` `code` (`app.error.code`), then rethrows. **It records no arguments** (they carry passwords, tokens and chat text). `http/di/useCaseTracing.ts` maps the whole `useCases` registration at once, so a new `http/di/use-cases/*` module is traced as soon as it is spread in. Keep those modules plain `asClass(...)`; wrapping preserves `TRANSIENT`. Tracing handles value, promise and async-generator `execute` (the chat stream's span stays open across iteration). `AuthenticateRequestUseCase` is the one exemption (`UNTRACED_USE_CASES`). It is enforced by `__tests__/architecture/useCaseTracing.test.ts`, which also fails if a `*UseCase` is registered outside `http/di/use-cases/`.

## Deployment (JEF-335)

Cloud Run `europe-west1` (web stays on Vercel, whose project is Terraform in `infra/vercel/`, JEF-363). The GCP side is Terraform in `infra/gcp/`, whose `README.md` is the runbook. Terraform owns config; CI owns releases (`deploy-api` builds `apps/api/Dockerfile` from the repo root and authenticates through WIF, which trusts only `main`, so `terraform plan` is run by hand rather than on PRs). CI's `migrate-db` runs migrations before the deploy; they are not in the image.

- **Request-based billing throttles CPU once no request is in flight**, so work that must finish is awaited before the response: the telemetry flush in `buildApp.ts`'s `onResponse`, and the new-device alert in `CreateSessionUseCase`. There are no in-process timers or schedulers.
- **`/admin/*` jobs** are driven by Cloud Scheduler with a Google **OIDC ID token** (JEF-336). `cronAuth.ts` verifies it via `IOidcTokenVerifier` (`GoogleOidcTokenVerifier`) and requires `aud` = `API_ORIGIN` and `email` = `CRON_INVOKER_SA`. `CRON_SECRET`/`DIGEST_ADMIN_SECRET` exist only for manual triggers. With none of the three configured, a route answers 503.
- **Logs** reach Axiom through `otelLogDestination.ts` (teed to stdout). On SIGTERM, `http/gracefulShutdown.ts` drains within `SHUTDOWN.SERVER_CLOSE_TIMEOUT_MS`, inside Cloud Run's 10 s grace period.

## Testing

Vitest.

- **Infrastructure tests:** `createTestDb()`, a real in-memory PGlite with migrations applied.
- **Integration tests:** `buildTestApp()`, which gives each call its own database.
- **Use-case tests:** the per-domain mocks in `__tests__/helpers/mocks/<domain>.ts` (cross-cutting doubles are in `infrastructure.ts`). Placement is enforced by `mockPlacement.test.ts`.
- **Resolver tests:** under `__tests__/interface-adapters/resolvers/`.
