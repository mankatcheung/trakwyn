# CLAUDE.md

Guidance for Claude Code in this repository. Subsystem detail lives next to the code and loads when you work there:

- `apps/api/CLAUDE.md`: auth cookies, session revocation, MCP, storage, email, database, observability, use-case spans, deployment and testing.
- `apps/web/CLAUDE.md`: routing, session detection, codegen and PostHog.
- `apps/mobile/CLAUDE.md`: routing, token storage and refresh, and PostHog native crashes.
- Runbooks: `infra/gcp/README.md` (Cloud Run deploy and cutover), `infra/axiom/README.md` (monitors), `infra/posthog/README.md` (PostHog project settings) and `infra/vercel/README.md` (web project, domains, env vars; apply after `infra/posthog`).

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
- **Chat tool results are shaped before the model sees them.** They pass through `projectChatToolResult` and `compactForModel` (`use-cases/chat/chatToolProjection.ts`) and are fenced in `<tool_result>` as data. History and message size are capped by `CHAT.*`. Anthropic `cacheBreakpoint`s are set in `buildChatMessages`. MCP output is deliberately left unprojected.

## Workflow

- **Linear lifecycle:**
  - Set the issue to **In Progress** before coding. Never code while it is in Backlog, Planned or Todo.
  - Set it to **In Review** once the branch is pushed and the PR is open.
  - Set it to **Done** only after the merge or when the user asks.
- **Branch:** `<feat|fix|chore|…>/<linear-id>-<brief-name>`. Include the lowercase Linear ID only when there is a ticket: `feat/jef-67-multi-provider-llm`, or without one, `feat/animated-page-transitions`.
- **Worktrees:** create them in `.claude/worktrees/`, named after the branch with `/` replaced by `-`, using `git worktree add .claude/worktrees/<name> -b <branch> main`. Then run `pnpm setup:worktree` inside it to copy the `.env` files, install, migrate and seed.
- **Tests ship in the same PR** as every new or changed use case, resolver, repository, component/page or utility. Follow the existing convention for that layer:
  - use-case tests with the `helpers/mocks/<domain>.ts` mocks
  - `createTestDb()` for repositories
  - resolver tests under `__tests__/interface-adapters/resolvers/`
  - web component tests under `apps/web/src/__tests__/components/`

  An unchecked "tests" item means the issue isn't done.

- **PRs:** push and open one when the work is done. The user reviews PRs directly and does not merge from the CLI.
