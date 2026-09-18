import path from 'node:path';
import { defineConfig } from 'drizzle-kit';
import { config as loadEnv } from 'dotenv';

// `db:generate` only diffs the schema against the snapshots in `drizzle/`,
// so it needs no database. `db:push`/`db:studio` connect to DATABASE_URL —
// the local PGlite directory (stop `pnpm dev` first: PGlite allows one
// process at a time) or a Postgres URL. Migrations are applied by
// `db:migrate` (src/migrate.ts), never by drizzle-kit, so there is one
// migrator and one tracking table.
// No explicit `path` option: dotenv's own default (`process.cwd() + '.env'`)
// is what we want here, and is more reliable than resolving off
// `import.meta.dirname` — drizzle-kit loads this file through its own loader,
// under which `import.meta.dirname` comes back `undefined`. `pnpm --filter
// @trakwyn/api db:*` always runs with cwd set to this package directory, so
// the default resolves correctly. dotenv silently no-ops if no .env file is
// found (e.g. CI, where env vars are expected to already be set).
loadEnv();

// Mirrors `createDb`'s schemes. Not imported from it: drizzle-kit loads this
// file outside the app's `#src/*` import map.
const PGLITE_SCHEME = 'pglite:';
const databaseUrl = process.env.DATABASE_URL ?? `${PGLITE_SCHEME}./.pglite`;

const shared = {
  dialect: 'postgresql',
  schema: path.join('src', 'infrastructure', 'db', 'schema.ts'),
  out: path.join('drizzle'),
} as const;

export default databaseUrl.startsWith(PGLITE_SCHEME)
  ? defineConfig({
      ...shared,
      driver: 'pglite',
      dbCredentials: { url: databaseUrl.slice(PGLITE_SCHEME.length) },
    })
  : defineConfig({ ...shared, dbCredentials: { url: databaseUrl } });
