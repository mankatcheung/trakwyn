import pg from 'pg';
import { drizzle as drizzleNodePg } from 'drizzle-orm/node-postgres';
import type { ExtractTablesWithRelations } from 'drizzle-orm';
import type { PgDatabase, PgQueryResultHKT, PgTransaction } from 'drizzle-orm/pg-core';
import { DATABASE } from '#src/infrastructure/config/constants.js';
import { otelMetrics, type IMetrics } from '#src/infrastructure/observability/metrics.js';
import { rootLogger } from '#src/infrastructure/observability/rootLogger.js';
import type { ILogger } from '#src/use-cases/ports/ILogger.js';
import * as schema from './schema.js';

type Schema = typeof schema;
type Relations = ExtractTablesWithRelations<Schema>;

/**
 * Typed against the driver-neutral `PgDatabase` rather than node-postgres's
 * own class, so the `pg` pool used in production and the PGlite instance used
 * in dev and tests are the same type to every repository.
 */
export type DrizzleDb = PgDatabase<PgQueryResultHKT, Schema, Relations>;
export type DrizzleTransaction = PgTransaction<PgQueryResultHKT, Schema, Relations>;
export type DrizzleClient = DrizzleDb | DrizzleTransaction;

export interface DbHandle {
  db: DrizzleDb;
  close: () => Promise<void>;
}

/**
 * `count(*)` and `sum()` over an `integer` column return `int8`, which
 * node-postgres hands back as a string to avoid losing precision past 2^53.
 * Nothing this schema counts or sums gets near that, and the repositories —
 * written against SQLite, where these were plain numbers — treat them as
 * numbers. PGlite already returns `int8` as a number, so this makes the two
 * drivers agree.
 *
 * It is process-wide and not limited to aggregates: every `bigint` column
 * (salaries, `monthlyTokenLimit` — declared `mode: 'number'` anyway) and any
 * raw query returning `int8` is parsed through it. A future column that can
 * exceed 2^53 (e.g. money in minor units at scale) must not rely on it —
 * declare it `mode: 'bigint'` and cast in SQL, or it loses precision silently.
 *
 * `numeric` (`avg()`, `sum()` over a `bigint`) is deliberately left a string
 * on both: drizzle's PGlite session replaces any parser for it on every query,
 * so parsing it here would make production and the tests disagree. Nothing
 * produces one today; cast in SQL (`::int8`) or `Number()` it if that changes.
 */
pg.types.setTypeParser(DATABASE.INT8_OID, (value: string) => Number(value));

export function isPgliteUrl(url: string): boolean {
  return url.startsWith(DATABASE.PGLITE_SCHEME);
}

/** `pglite:memory` → in-memory; `pglite:./.pglite` → that data directory. */
function pgliteDataDir(url: string): string {
  const target = url.slice(DATABASE.PGLITE_SCHEME.length);
  // Explicit `memory://`, never `undefined`: given an undefined data dir,
  // PGlite silently ignores the `loadDataDir` snapshot and boots empty.
  return target === DATABASE.PGLITE_IN_MEMORY ? 'memory://' : target;
}

function createPoolDb(url: string, options: CreateDbOptions): DbHandle {
  const { logger = rootLogger, metrics = otelMetrics } = options;
  const pool = new pg.Pool({
    connectionString: url,
    max: DATABASE.POOL_MAX,
    idleTimeoutMillis: DATABASE.POOL_IDLE_TIMEOUT_MS,
    connectionTimeoutMillis: DATABASE.POOL_CONNECTION_TIMEOUT_MS,
  });

  // An idle client whose socket is closed from the other end — Neon scaling
  // to zero, the pooler recycling a server connection — is reported here.
  // Without a listener, `pg` re-emits it as an unhandled 'error' event and
  // the process exits. The pool has already discarded that client; the next
  // query opens a fresh one, so recording it is all that is needed.
  //
  // Through the logger rather than console.error (JEF-351): only Fastify's
  // pino stream is teed to Axiom, so a bare console line reached Cloud
  // Logging and nothing else. The counter is the part that makes a *rate*
  // visible — one of these is routine, a climbing rate means
  // POOL_IDLE_TIMEOUT_MS no longer matches what the server allows.
  pool.on('error', (err) => {
    metrics.recordDatabasePoolError();
    logger.error('Postgres pool: idle client error', err);
  });

  return {
    db: drizzleNodePg({ client: pool, schema }) as unknown as DrizzleDb,
    close: () => pool.end(),
  };
}

export interface CreateDbOptions {
  /**
   * PGlite only: boot from this data-directory snapshot (`dumpDataDir()`)
   * instead of running `initdb`. The test helpers clone one pre-migrated
   * template this way — several times faster than migrating per database.
   */
  pgliteSnapshot?: Blob;
  /**
   * Postgres pool only: where the pool's `'error'` events go. Defaults to
   * `rootLogger`, because the process database is built at module load in
   * `db/client.ts`, before there is a container to be injected from — see
   * rootLogger.ts. Passed explicitly by tests.
   */
  logger?: ILogger;
  /** Postgres pool only: counts those same errors. Defaults to `otelMetrics`. */
  metrics?: IMetrics;
}

async function createPgliteDb(url: string, options: CreateDbOptions): Promise<DbHandle> {
  // Imported on demand: production never uses PGlite, so it never loads its
  // WASM build. It is a devDependency and absent from the production image —
  // a `pglite:` URL there fails here, at startup, with a module-not-found.
  const [{ PGlite }, { drizzle: drizzlePglite }] = await Promise.all([
    import('@electric-sql/pglite'),
    import('drizzle-orm/pglite'),
  ]);
  const client = new PGlite(pgliteDataDir(url), { loadDataDir: options.pgliteSnapshot });
  return {
    db: drizzlePglite({ client, schema }) as unknown as DrizzleDb,
    close: () => client.close(),
  };
}

/** Builds a Drizzle database for `url` — see `DATABASE` for the schemes. */
export async function createDb(url: string, options: CreateDbOptions = {}): Promise<DbHandle> {
  // A `.env` written before JEF-342 still points at the old SQLite file. Say
  // so, rather than letting `pg` fail on it as an unreachable host.
  if (url.startsWith(DATABASE.LEGACY_SQLITE_SCHEME)) {
    throw new Error(
      `DATABASE_URL is a SQLite file URL (${url}); the API now runs on Postgres. ` +
        `Set DATABASE_URL=pglite:./.pglite for local dev, then run pnpm db:migrate and pnpm db:seed.`,
    );
  }
  return isPgliteUrl(url) ? createPgliteDb(url, options) : createPoolDb(url, options);
}
