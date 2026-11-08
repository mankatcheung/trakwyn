# CLAUDE.md

Guidance for Claude Code in this repository. Subsystem detail lives next to the code and loads when you work there:

- `apps/api/CLAUDE.md`: auth cookies, session revocation, database, deployment, client compatibility and testing, plus an index of the nested `CLAUDE.md` files next to the code they describe (billing, AI, MCP, storage, observability and so on). Those load only when you work in their directory.
- `apps/web/CLAUDE.md`: routing, session detection, codegen and PostHog.
- `apps/mobile/CLAUDE.md`: routing, token storage and refresh, the four test tiers and Maestro, and PostHog native crashes.
- `apps/extension/CLAUDE.md`: the WXT build for Chrome and Safari, the Safari Xcode wrapper, OAuth sign-in per browser, and error reporting to PostHog.
- `content/README.md`: the Markdown guides on the marketing site (`content/guides/en/<slug>/index.md`), how to add one, the image rules and how drafts work.
- Runbooks: `infra/gcp/README.md` (Cloud Run deploy and cutover), `infra/axiom/README.md` (monitors), `infra/posthog/README.md` (PostHog project settings, mobile release health dashboard), `infra/vercel/README.md` (web project, domains, env vars, the API's two Blob stores and moving documents to the private one; apply after `infra/posthog` and before `infra/gcp/load-secrets.sh`), `infra/cloudflare/README.md` (DNS records, zone settings, email forwarding rules), `infra/brevo/README.md` (Brevo sender domain), `infra/upstash/README.md` (production Redis database; its state holds the Redis credentials) and `infra/polar/README.md` (payment provider products, prices, webhook and launch; no Terraform) and `infra/neon/README.md` (production branch, compute sizing and suspend, database; no credentials in state).

## Commands

Run from the monorepo root (Turborepo) unless noted.

```bash
pnpm dev                 # api + web
pnpm build
pnpm typecheck
pnpm test                # or: pnpm --filter @trakwyn/api test / @trakwyn/web
cd apps/api && pnpm test -- src/__tests__/application/auth/LoginUseCase.test.ts  # single file
pnpm lint
pnpm format

pnpm db:generate         # migration SQL after schema.ts changes
pnpm db:migrate          # apply migrations (src/migrate.ts, not drizzle-kit migrate)
pnpm --filter @trakwyn/api plan set --email a@b.com --plan pro --days 30   # put a user on a plan by hand
pnpm --filter @trakwyn/api plan grant-trial --dry-run                      # launch trial for existing users
pnpm --filter @trakwyn/api email-verification backfill --before 2026-11-01 --dry-run  # mark pre-wall accounts verified
cd apps/api && pnpm db:studio   # stop `pnpm dev` first when on PGlite

cd apps/web && pnpm codegen     # needs the API at localhost:3001
```

## Architecture

**Monorepo:**

- `apps/api`: Fastify + Mercurius + Pothos GraphQL server.
- `apps/web`: TanStack Start.
- `apps/mobile`: Expo.
- `apps/extension`: the "Trakwyn Clipper" browser extension.
- `apps/cli`: `@trakwyn/cli`.
- `packages/ui`: `@trakwyn/ui`, a Tailwind v4 component library developed in Storybook.

API types reach the clients through GraphQL codegen, not a shared package.

**API layers** (Clean Architecture, `apps/api/src/`):

```
domain/              Pure entities, no dependencies
use-cases/           Business logic; ports/ holds repository/provider interfaces
interface-adapters/  GraphQL resolvers, mappers (Drizzle row → domain), MCP, LLM tool catalogue
infrastructure/      Drizzle db + repositories, storage, email, cache, observability, net
http/                Pothos schema (types/ queries/ mutations/ composed in schema/index.ts),
                     adapters/fastify/ (plugins, incl. corsPlugin.ts), routes, errors, di/, context.ts
```

**Dependency injection:** Awilix (`@fastify/awilix`). Repositories and resolvers are `SINGLETON`; use cases are `TRANSIENT`. `http/di/index.ts` (`buildContainer`) composes the modules in `http/di/*.ts` and `http/di/use-cases/*.ts` (one per domain). The `Cradle` type is in `http/di/types.ts`. Decorators such as `Cached*`, `Blocklisting*` and `Logging*` wrap an inner repository in the DI module.

**Mobile testing (JEF-300):** four tiers (unit, component, integration against a booted API, Maestro e2e), with a Jest check that no suite belongs to no tier. Details are in `apps/mobile/CLAUDE.md`.

## Environment Setup

```bash
cp apps/api/.env.example apps/api/.env
cp apps/web/.env.example apps/web/.env
```

`DATABASE_URL` is `pglite:./.pglite` for local dev, or any `postgres://` URL. A leftover `file:…local.db` value is rejected, and `pnpm setup:worktree` rewrites it. `JWT_SECRET` and `JWT_REFRESH_SECRET` must be set.

## Key Conventions

- **IDs** are `nanoid()` strings.
- **Domain entities** are plain TS with no Drizzle or framework imports. Mappers bridge rows and domain objects.
- **New feature order:**
  1. domain entity
  2. port
  3. use case
  4. Drizzle repository
  5. Pothos type/resolver
  6. query/mutation
  7. `http/di/` registration
  8. web `.graphql` file
  9. codegen
  10. UI
- **Use cases fail with a `DomainError` subclass** (`use-cases/errors/DomainError.ts`). The classes carry a `code`, not an HTTP status; `http/errors/formatError.ts` maps it via `fromCodedError`, and a new subclass needs a case there or it becomes a 500. `LlmProviderError` (with a `kind`, mapped to 502) is what the LLM provider adapters throw when the user's own provider answers non-2xx.
  - Never import `AppError` into a use case. It is for HTTP routes and resolvers only.
  - Never `throw new Error()` for anything the client should see.
  - Never hand-roll `Object.assign(new Error(), { code })`.

  Enforced by `domainErrors.test.ts`.

- **Layering is enforced** by `dependencyRule.test.ts`:
  - It resolves every import form, `#src/` or relative.
  - It bans frameworks in `domain/` and `use-cases/`.
  - It keeps `src/` root to the entrypoints only.
  - Its exemption list must shrink as violations are fixed.
- **Constants belong to a layer:**
  - Policy goes in `use-cases/constants.ts`.
  - `ERROR_CODES` goes in `use-cases/errors/errorCodes.ts`.
  - Env names, providers, vendor endpoints and cache internals go in `infrastructure/config/constants.ts`.
  - Cookies, routes and rate limits go in `http/constants.ts`.
  - MCP framing goes in `interface-adapters/mcp/constants.ts`.

  State each value once and derive the rest (e.g. `COOKIE_MAX_AGE_S` is `TOKEN_LIFETIME_S`). Enforced by `constantsPlacement.test.ts`.

- **Deletes are hard and `onDelete` is the retention policy.** Every FK must be listed, with its reason, in `onDeleteBehaviour.test.ts`. The audit tables (`SecurityEvent`, `LoginEvent`, `ActivityLog`) cascade deliberately so erasure removes IP and device data. Only `Document` ↔ `DocumentDraft` is `set null`.
- **One soft delete:** `JobApplication.deletedAt` (Trash, purged after 30 days by `/admin/trash/purge`). The filter lives in `DrizzleApplicationRepository`, so every consumer is covered. `findById` hides trashed rows; `findByIdIncludingTrashed` is only for the detail query and Trash operations.
- **Source files over 400 lines** need an `OVERSIZED_BY_DESIGN` entry with a reason (`fileSize.test.ts`). The entry must be removed once the file shrinks below the limit.
- **User-supplied URLs go through `IOutboundUrlPolicy` before any server-side fetch.** Today these are the custom LLM base URL and `parseJobDescription(url)`.
  - The policy blocks private and loopback ranges, internal ports, reserved hosts and credentials, and requires `https` for providers.
  - It is strict only when `NODE_ENV=production`, because dev and CI point at the local fake provider (`LLM_PROVIDER_MODE=fake`). `OUTBOUND_URL_POLICY=strict|permissive` overrides that.
  - Check at save time (`SaveLlmApiKeyUseCase`, `TestLlmApiKeyUseCase`) _and_ on every call or redirect hop (`OpenAICompatibleLLMProvider`, `FetchJobPostingSourceResolver`), since DNS can be re-pointed.
  - Register it with `asFunction`, not `asClass`.
- **Plans are decided by `IEntitlementService` (JEF-344), never by a constant in a use case.**
  - A Pro feature calls `assertFeature(userId, feature)` first; a per-user cap is passed to the repository (`applicationLimit`, `storageLimitBytes`) instead of being read from `CONTENT_LIMITS` there.
  - `PLANS_ENFORCED` is off by default, and then every feature is on but the caps that already existed stay. Only `EntitlementService` reads it.
  - A downgrade never touches data. Details are in `apps/api/src/use-cases/plans/CLAUDE.md`. AI actions with the user's own key and MCP access are on for both plans (JEF-442).
- **Chat writes are proposals the user confirms (JEF-469).** Chat is offered the catalogue's non-destructive writes but never runs one: `executeChatTool` saves a `ChatActionProposal` and tells the model it was **not applied**; `confirmChatAction` applies the saved arguments once, in a transaction, through the same handlers as MCP. No delete is offered. Web and mobile render the cards from `chatHistory`. Details are in `apps/api/src/use-cases/chat/CLAUDE.md`.
- **Chat tool results are shaped before the model sees them.** They pass through `projectChatToolResult` and `compactForModel` (`use-cases/chat/chatToolProjection.ts`) and are fenced in `<tool_result>` as data. History and message size are capped by `CHAT.*`. Anthropic `cacheBreakpoint`s are set in `buildChatMessages`. MCP output is deliberately left unprojected.

## Workflow

- **Linear lifecycle:**
  - Set the issue to **In Progress** before coding. Never code while it is in Backlog, Planned or Todo.
  - Set it to **In Review** once the branch is pushed and the PR is open.
  - Set it to **Done** only after the merge or when the user asks.
- **Branch:** `<feat|fix|chore|…>/<linear-id>-<brief-name>`. Include the lowercase Linear ID only when there is a ticket: `feat/jef-67-multi-provider-llm`, or without one, `feat/animated-page-transitions`.
- **Worktrees:** create them in `.claude/worktrees/`, named after the branch with `/` replaced by `-`, using `git worktree add .claude/worktrees/<name> -b <branch> main`. Then run `pnpm setup:worktree` inside it to copy the `.env` files, link the gitignored `infra/*/terraform.tfvars` and `.envrc` files from the main checkout (symlinks, so edit them there), install, migrate and seed. Run `terraform init` in each infra root you use.
- **Tests ship in the same PR** as every new or changed use case, resolver, repository, component/page or utility. Follow the existing convention for that layer:
  - use-case tests with the `helpers/mocks/<domain>.ts` mocks
  - `createTestDb()` for repositories
  - resolver tests under `__tests__/interface-adapters/resolvers/`
  - web component tests under `apps/web/src/__tests__/components/`

  An unchecked "tests" item means the issue isn't done.

- **Clean up processes you start.** Stop any dev server, watcher, emulator or browser you launched before you finish. Start long-running commands with `run_in_background` so they can be stopped, never with `nohup`, `disown` or a trailing `&`, which detach them from the session.
- **PRs:** push and open one when the work is done. The user reviews PRs directly and does not merge from the CLI.
- **CI security checks (JEF-477):**
  - Actions are referenced by major version (`actions/checkout@v4`). Renovate's `github-actions` manager bumps them in one weekly PR.
  - `ci.yml` runs `dependency-review` (fails on high severity) and `secret-scan` (gitleaks, config in `.gitleaks.toml`) on pull requests, and both are in `ci-ok`'s `needs`. A new e2e placeholder value needs an `e2e-only-` prefix or an allowlist entry.
  - `codeql.yml` scans JavaScript/TypeScript on pushes to main, on pull requests touching code and weekly. It is its own workflow because it needs `security-events: write`; results go to the Security tab and it is not part of `ci-ok`.
- **Releases (release-please, `.github/workflows/release.yml`):** the Clipper (`apps/extension`), the mobile app (`apps/mobile`), the CLI (`apps/cli`) and the server stack, `apps/api` and `apps/web`, which share one version. `packages/ui` is not versioned.
  - **The server pair is linked** (`linked-versions` plugin, group `server`): one version, two tags (`api-v…`, `web-v…`). A commit counts for whichever of the two it touches. They use the `simple` release type, so a release PR edits `version.txt` and `CHANGELOG.md` in each app and never `package.json`. `ci.yml` deploys on `apps/api/**` and `apps/web/**`, so it negates exactly those four files, and mobile's `package.json` and `CHANGELOG.md` (`ci.yml` also deploys on `apps/mobile/**`). A release PR must not deploy: if `ci.yml` starts watching another versioned package, or a release PR edits another file there, negate it too (held by `releaseVersioning.test.ts`). The version labels changelogs and gives self-hosters something to pin to; the commit SHA still names what is live.
  - **The server release PR's title must match `group-pull-request-title-pattern`** (`chore${scope}: release server libraries`). The plugin hardcodes that title and release-please parses a merged PR's title with the pattern; without a match it logs `Bad pull request title`, creates no `api-v…`/`web-v…` tag or release, and stops updating every other release PR ("untagged, merged release PRs outstanding"). If you rename the group, change the pattern with it (held by `releaseVersioning.test.ts`).
  - **The squash-commit title sets the bump:** `fix` is a patch, `feat` a minor, `!` or a `BREAKING CHANGE` footer a major (a minor while the package is below `1.0.0`). Other types (`chore`, `docs`, `ci`, …) release nothing.
  - **A commit belongs to a package by the files it touches,** not by the `(scope)` in its title.
  - **To release,** merge that package's open release PR. It bumps the version (`package.json`, or `version.txt` for the API and web) and `CHANGELOG.md`, and the workflow tags it (`clipper-v0.2.0`) and creates the GitHub Release. Never edit a version or a changelog by hand. To force a number, such as a first store release, set `"release-as"` on the package in `release-please-config.json` and remove it once that release is tagged (a `Release-As:` footer in a squash-merge message was ignored for the Clipper's 1.0.0, JEF-418).
  - **`package.json` is the only place a version is written.** The CLI reads it in `src/lib/version.ts`, mobile in `app.config.ts`, and WXT fills the Clipper's manifests from it. The Safari Xcode project is the exception: see `apps/extension/CLAUDE.md`.
  - The versioned packages are listed in `release-please-config.json` and `.release-please-manifest.json`, held by `releaseVersioning.test.ts`.
