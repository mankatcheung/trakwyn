# Trakwyn

Trakwyn is a job application tracker that helps you manage your job search end to end: log applications, track interview rounds and offers, keep notes and documents attached to each one, and get AI-assisted help drafting cover letters and filling in job descriptions.

The project is a monorepo with a GraphQL API, a web app, a browser extension for clipping job postings, and a CLI.

## Apps

| App       | Path             | Description                                                                                                                  |
| --------- | ---------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| API       | `apps/api`       | Fastify + Mercurius + Pothos GraphQL server, following Clean Architecture. Owns auth, data, and all business logic.          |
| Web       | `apps/web`       | TanStack Start (SSR React) frontend — the main UI for managing applications.                                                 |
| Extension | `apps/extension` | Browser extension ("Trakwyn Clipper") that saves job postings from LinkedIn, Indeed, and Glassdoor straight to your account. |
| CLI       | `apps/cli`       | `tw` command-line tool for authenticating and managing applications from the terminal.                                       |

## Features

- **Applications** — track job applications through their lifecycle, with interview rounds, offers, and outcomes. Both the list and board views let you pick which details (role, location, date, tags, status, starred, ghosted) show on each row or card.
- **Notes & documents** — attach notes and versioned documents (resumes, cover letters) to each application; upload via local disk (dev) or Vercel Blob (prod).
- **Contacts & conversations** — keep track of recruiters/contacts and message threads per application.
- **AI assistance (bring-your-own-key)** — auto-fill job descriptions and generate cover letters using your own OpenRouter or Google AI key, plus a chat assistant and company briefings. The assistant sidebar keeps a "New conversation" shortcut, your 10 most recent chats, and an "All chats" page with full, searchable conversation history.
- **Calendar & reminders** — interview scheduling and follow-up reminders, with email (Brevo) and web push notifications.
- **Analytics** — dashboards for response times, application channels, interview rounds, and offer outcomes.
- **Auth** — email/password with TOTP two-factor, Google/GitHub OAuth, session management, security event log, and API tokens for CLI/extension access.
- **Share links** — share a read-only summary of your job search progress via a public link.
- **Weekly digest** — scheduled email summary of your job search activity.
- **Localization** — the app, including the public marketing site, is available in 5 locales (i18next).
- **MCP server** — expose your job-search data read-only to an AI assistant ([details below](#mcp-server)).

## MCP server

The API ships a [Model Context Protocol](https://modelcontextprotocol.io) server, so an AI assistant can read your job-search data, answer questions about it, and — with full access — log applications and notes for you.

**Most tools are read-only, and read-only access can only reach those.** A few tools create or update data; they require full access and are refused outright otherwise. **Nothing deletes** — there are no delete tools at all.

### Connecting with OAuth (recommended)

Most MCP clients — Claude Desktop, Cursor, Claude Code, and others — support
OAuth, which is the easiest way to connect: nothing to copy, paste, or store
yourself. [docs/mcp-oauth.md](docs/mcp-oauth.md) walks through the whole flow
and the reasoning behind it; the summary is below.

Point your client at the endpoint, `POST https://api.trakwyn.com/mcp`. The
client discovers the authorization server from:

- `GET https://api.trakwyn.com/.well-known/oauth-protected-resource`
- `GET https://api.trakwyn.com/.well-known/oauth-authorization-server`

The authorization server supports dynamic public-client registration, the
authorization-code flow with PKCE (`S256`), rotating refresh tokens, and token
revocation. Redirect URIs must be exact HTTPS URLs, or loopback HTTP URLs for
local clients. The authorization flow uses your existing Trakwyn browser
session and displays an explicit MCP consent screen before issuing a code —
sign in, approve, and the client is connected.

The consent screen asks for one of two scopes: a `read` grant reaches the
read-only tools and nothing else; `full` also reaches the tools that create or
update records. Start with `read` unless the client genuinely needs to write.

Revoking is grant-wide. `POST /oauth/revoke` accepts either an access token or
a refresh token, and either one takes down every credential issued from that
consent — so a client cannot "revoke" and then quietly refresh its way back in.
The same happens automatically if an authorization code or a rotated refresh
token is ever replayed, since that means the credential leaked.

**Deploy prerequisite:** set `API_ORIGIN` to this API's own public origin (e.g.
`https://api.trakwyn.com`). It is what the discovery documents advertise as the
issuer and endpoint URLs; without it they fall back to the request's `Host`
header, which a caller controls.

For Claude Code:

```bash
claude mcp add --transport http trakwyn https://api.trakwyn.com/mcp
```

### API tokens (fallback)

For a script, a CI job, or a client that doesn't support OAuth, a manually
created API token works the same way a `read`/`full` OAuth grant does:

1. In the web app, go to **Settings → Integrations → API tokens**.
2. Create a token with **Read-only** access if you only want the assistant to _read_ your data — it's refused by both the GraphQL API and the MCP write tools, so it can't change anything even if it leaks. Choose **Full access** only if you want the assistant to be able to create and update records too.
3. Copy the token (`trakwyn_…`) — it's shown only once.

Authenticate with `Authorization: Bearer <token>` instead of an OAuth access
token — the endpoint accepts either. Existing `trakwyn_...` tokens keep working
regardless of how many clients connect over OAuth.

Verify it works:

```bash
curl -s https://api.trakwyn.com/mcp \
  -H "Authorization: Bearer trakwyn_your_token_here" \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}'
```

You should get a JSON-RPC response listing the tools below. To fetch data:

```bash
curl -s https://api.trakwyn.com/mcp \
  -H "Authorization: Bearer trakwyn_your_token_here" \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":2,"method":"tools/call",
       "params":{"name":"list_applications","arguments":{"status":"interviewing"}}}'
```

For Claude Code with a token instead of OAuth:

```bash
claude mcp add --transport http trakwyn https://api.trakwyn.com/mcp \
  --header "Authorization: Bearer trakwyn_your_token_here"
```

> **Transport caveat:** this endpoint is plain JSON-RPC over `POST` — there is no `GET`/SSE endpoint and no session management, so it implements only the subset of MCP's Streamable HTTP transport that request/response tooling needs. The `curl` calls above are covered by integration tests and are known to work. Clients that require SSE or session negotiation may not connect; if yours doesn't, that's the likely reason.

### Tools

All are scoped to the authenticated user — a token can never read another account's data.

`list_applications` is paginated: it returns `{ items, hasNextPage, nextCursor }`. Pass the returned `nextCursor` back to fetch the following page. Everything else returns its records directly.

| Tool                    | Arguments                                  |
| ----------------------- | ------------------------------------------ |
| `list_applications`     | `status`, `limit`, `cursor` (all optional) |
| `get_application`       | `applicationId`                            |
| `list_notes`            | `applicationId`                            |
| `list_contacts`         | `applicationId`                            |
| `list_interview_rounds` | `applicationId`                            |
| `list_work_experiences` | —                                          |
| `list_educations`       | —                                          |
| `list_skills`           | —                                          |
| `list_documents`        | `applicationId`                            |
| `list_offers`           | `applicationId`                            |
| `list_activity`         | `applicationId`                            |
| `list_calendar_events`  | —                                          |
| `get_analytics`         | —                                          |

A full-access token also reaches these write tools, which create or update records (required arguments shown; each also accepts further optional fields to set):

| Tool                     | Required arguments              |
| ------------------------ | ------------------------------- |
| `create_application`     | `company`, `role`               |
| `update_application`     | `applicationId`                 |
| `create_note`            | `applicationId`, `content`      |
| `create_interview_round` | `applicationId`                 |
| `create_skill`           | `name`                          |
| `update_skill`           | `skillId`                       |
| `create_education`       | `institution`, `startDate`      |
| `update_education`       | `educationId`                   |
| `create_work_experience` | `company`, `title`, `startDate` |
| `update_work_experience` | `workExperienceId`              |

Server identifies as `trakwyn-mcp` v1.0.0, MCP protocol `2024-11-05`. Supported methods: `initialize`, `tools/list`, `tools/call`.

For local development the endpoint is `http://localhost:3001/mcp`.

## Prerequisites

- Node.js >= 24
- pnpm >= 9

## Local Setup

1. **Install dependencies** (from the repo root):

   ```bash
   pnpm install
   ```

2. **Configure environment variables** — copy both example env files and fill them in:

   ```bash
   cp apps/api/.env.example apps/api/.env
   cp apps/web/.env.example apps/web/.env
   ```

   In `apps/api/.env`, at minimum set:
   - `DATABASE_URL` — an **absolute path** to a local SQLite file, e.g. `file:/absolute/path/to/trakwyn/apps/api/local.db`
   - `JWT_SECRET` and `JWT_REFRESH_SECRET` — any strong random values
   - `TOTP_ENCRYPTION_KEY` and `LLM_API_KEY_ENCRYPTION_KEY` — any strong random values

   Everything else in `apps/api/.env.example` (OAuth, email, push, Redis, observability) is optional for local dev and can be left blank — those features are simply disabled until configured.

3. **Apply database migrations:**

   ```bash
   pnpm db:migrate
   ```

4. **Run the app** (starts both the API and web app):

   ```bash
   pnpm dev
   ```

   The API runs at `http://localhost:3001` and the web app at `http://localhost:3000` (proxying `/graphql` to the API).

## Other Useful Commands

```bash
pnpm build       # Build all packages
pnpm typecheck   # Type-check all packages
pnpm test        # Run all tests
pnpm lint        # Lint
pnpm format      # Format with Prettier

cd apps/api && pnpm db:studio   # Open Drizzle Studio to inspect the local DB

# GraphQL codegen (requires the API running at localhost:3001)
cd apps/web && pnpm codegen
```

See [CLAUDE.md](./CLAUDE.md) for architecture details and development conventions.

## Releases

The API and web app deploy on every merge to `main` and are identified by commit SHA. The browser extension, the mobile app and the CLI are versioned with [release-please](https://github.com/googleapis/release-please):

- Each merge to `main` updates a release PR per package, with the version bump and changelog derived from the commit titles (`fix` is a patch, `feat` a minor, `!` a major).
- Merging a release PR tags the release (for example `clipper-v1.1.0`) and creates a GitHub Release.

Versions live in each package's `package.json` and are never edited by hand.

## License

[AGPL-3.0](./LICENSE)
