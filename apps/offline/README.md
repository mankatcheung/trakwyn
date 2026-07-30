# Job Finder — Offline Mode

A self-contained, offline version of Job Finder that runs entirely on your local machine. No cloud services, no authentication required, all data stored locally.

## Quick Start

```bash
# Prerequisites: Node.js 18+ installed

# From the monorepo root
pnpm dev

# Or just the offline package
cd apps/offline
pnpm dev
```

## What It Does

When you run `job-finder`, it:

1. **Creates a config directory** at `~/.job-finder/`
2. **Generates a `.env` file** with random secrets (first run only)
3. **Sets up the SQLite database** at `~/.job-finder/data/job-finder.db`
4. **Starts the API server** on port 3001
5. **Starts the web app** on port 3000 (with Vite dev server)
6. **Opens your browser** to `http://localhost:3000`

## How It Works

### Offline Mode

The offline mode bypasses authentication entirely. Every request is automatically authenticated as a local user (`local@job-finder.local`). This means:

- No login required
- No passwords to remember
- All features work immediately
- Data stays on your machine

### Data Storage

All data is stored in `~/.job-finder/`:

```
~/.job-finder/
├── .env              # Configuration (auto-generated)
├── data/
│   └── job-finder.db # SQLite database
└── uploads/          # File attachments
```

### What's Included

- Full GraphQL API at `http://localhost:3001/graphql`
- Web app UI at `http://localhost:3000`
- Job application CRUD (create, read, update, delete)
- Notes, contacts, and interview rounds per application
- Document attachments (stored locally)
- Activity logging
- Tagging system

### What's Disabled

- **Authentication** — No login required (auto-authenticated)
- **OAuth** — Google/GitHub sign-in (requires external credentials)
- **Email** — Password reset, email verification (requires Brevo API)
- **LLM Features** — Job description parsing, cover letters (requires API keys)
- **Observability** — Tracing and metrics (requires Axiom)

## Configuration

On first run, a `.env` file is created at `~/.job-finder/.env` with:

```bash
# Database
DATABASE_URL=file:~/.job-finder/data/job-finder.db

# Authentication (required internally)
JWT_SECRET=<random>
JWT_REFRESH_SECRET=<random>
TOTP_ENCRYPTION_KEY=<random>

# Offline mode
OFFLINE_MODE=true
PORT=3000
NODE_ENV=development

# Storage
STORAGE_PROVIDER=local
```

You can edit this file to change settings.

## Architecture

The offline package runs two servers:

1. **API Server** (`apps/api`) — Fastify + GraphQL + Drizzle ORM on port 3001
2. **Web App** (`apps/web`) — Vite dev server on port 3000 (proxies to API)

The web app's Vite config proxies `/graphql` requests to the API server, so everything works seamlessly.

### Key Files

- `src/index.ts` — CLI entry point with Node.js version check
- `src/config.ts` — Auto-generates `.env` in `~/.job-finder/`
- `src/setup.ts` — Runs database migrations
- `src/server.ts` — Starts both servers and opens browser

### How Auth Bypass Works

In `apps/api/src/http/adapters/fastify/buildGraphQLContext.ts`:

```typescript
if (process.env[ENV.OFFLINE_MODE] === 'true') {
  return {
    user: OFFLINE_USER, // { sub: 'offline-user', email: 'local@job-finder.local' }
    diScope,
    request: toHttpRequest(request),
    reply: toHttpResponse(reply),
  };
}
```

When `OFFLINE_MODE=true`, every request is authenticated as the offline user, bypassing all JWT/cookie validation.

## Troubleshooting

### Port Already in Use

Change the port in `~/.job-finder/.env`:

```bash
PORT=3001
```

Then update the web app's Vite proxy config to point to the new port.

### Database Issues

Delete the database and restart:

```bash
rm ~/.job-finder/data/job-finder.db
pnpm dev
```

### Web App Not Loading

Make sure both servers are running. Check the terminal output for any errors.

## License

MIT
