import pg from 'pg';
import { sql } from 'drizzle-orm';
import { describe, it, expect, afterEach, vi } from 'vitest';
import { DATABASE } from '#src/infrastructure/config/constants.js';
import { createDb, isPgliteUrl, type DbHandle } from '#src/infrastructure/db/createDb.js';
import { makeFakeMetrics } from '#src/__tests__/helpers/fakeMetrics.js';
import { makeLogger } from '#src/__tests__/helpers/mocks/infrastructure.js';

// Several of these boot fresh PGlite databases (`initdb` included); see the
// note in applyMigrations.test.ts for why they get a longer ceiling.
describe('createDb', { timeout: 60_000 }, () => {
  let handle: DbHandle | undefined;

  afterEach(async () => {
    await handle?.close();
    handle = undefined;
  });

  it('selects PGlite for pglite: URLs and the pg pool for everything else', () => {
    expect(isPgliteUrl('pglite:memory')).toBe(true);
    expect(isPgliteUrl('pglite:./.pglite')).toBe(true);
    expect(isPgliteUrl('postgres://user:pw@host/db')).toBe(false);
    expect(isPgliteUrl('postgresql://user:pw@host-pooler.neon.tech/db?sslmode=require')).toBe(
      false,
    );
  });

  it('rejects a leftover SQLite file URL with instructions instead of trying to connect', async () => {
    await expect(createDb('file:/tmp/local.db')).rejects.toThrow(/pglite:\.\/\.pglite/);
  });

  it('builds a pool-backed database without connecting until the first query', async () => {
    // Port 1 has nothing listening; creating the handle must still succeed,
    // which is what lets client.ts build its singleton at import time.
    handle = await createDb('postgres://nobody:nothing@127.0.0.1:1/none');
    expect(handle.db).toBeDefined();
  });

  /**
   * The pool's 'error' event is how an idle client whose socket was closed
   * from the other end is reported — routine against Neon, which scales to
   * zero. It used to go to console.error, which reached Cloud Logging and
   * never Axiom (JEF-351).
   *
   * The listener is captured off the real registration rather than exported
   * and tested on its own, so this covers the wiring too: a handler that
   * logs perfectly but is never attached leaves `pg` re-emitting an
   * unhandled 'error' and the process exiting.
   */
  describe('pool error handling', () => {
    async function poolErrorListeners(
      options: Parameters<typeof createDb>[1],
    ): Promise<Array<(err: Error) => void>> {
      // Spied on the prototype, and calling through, so the listener is
      // registered for real and this observes the registration rather than
      // replacing it.
      const on = vi.spyOn(pg.Pool.prototype, 'on');
      try {
        handle = await createDb('postgres://nobody:nothing@127.0.0.1:1/none', options);
        // Read before restoring: mockRestore() clears the recorded calls
        // along with the original implementation.
        return on.mock.calls
          .filter(([event]) => event === 'error')
          .map(([, listener]) => listener as (err: Error) => void);
      } finally {
        on.mockRestore();
      }
    }

    it('reports an idle client error to the logger and the counter', async () => {
      const logger = makeLogger();
      const metrics = makeFakeMetrics();

      const listeners = await poolErrorListeners({ logger, metrics });
      expect(listeners).toHaveLength(1);

      const err = new Error('Connection terminated unexpectedly');
      listeners[0](err);

      expect(logger.error).toHaveBeenCalledWith('Postgres pool: idle client error', err);
      // The counter is what makes a rising rate visible: one of these is
      // normal, a climbing rate means POOL_IDLE_TIMEOUT_MS is out of step
      // with how long the server keeps a connection.
      expect(metrics.databasePoolErrors).toBe(1);
    });

    it('counts every error, so a rate can be charted rather than a first occurrence', async () => {
      const logger = makeLogger();
      const metrics = makeFakeMetrics();

      const [listener] = await poolErrorListeners({ logger, metrics });
      listener(new Error('one'));
      listener(new Error('two'));

      expect(metrics.databasePoolErrors).toBe(2);
      expect(logger.error).toHaveBeenCalledTimes(2);
    });

    it('does not swallow the error by throwing out of the listener', async () => {
      // The listener runs inside pg's own emit; throwing there would turn a
      // recoverable pool error back into the process exit the handler exists
      // to prevent.
      const [listener] = await poolErrorListeners({
        logger: makeLogger(),
        metrics: makeFakeMetrics(),
      });

      expect(() => listener(new Error('boom'))).not.toThrow();
    });
  });

  it('parses int8 to a number on the pg driver', () => {
    // Production reads count(*)/sum() through node-postgres; without this
    // parser they arrive as strings and `count + 1` concatenates.
    expect(pg.types.getTypeParser(DATABASE.INT8_OID)('42')).toBe(42);
  });

  it('returns count(*) and sum() over integers as numbers from PGlite, as pg does', async () => {
    handle = await createDb('pglite:memory');
    const result = (await handle.db.execute(
      sql`SELECT count(*) AS c, sum(x) AS s FROM (VALUES (1), (2)) AS t(x)`,
    )) as unknown as { rows: { c: unknown; s: unknown }[] };

    expect(result.rows[0]).toEqual({ c: 2, s: 3 });
  });

  it('boots an in-memory database from a snapshot, with its contents', async () => {
    const { PGlite } = await import('@electric-sql/pglite');
    const source = new PGlite();
    await source.exec('CREATE TABLE "Snap" (id int); INSERT INTO "Snap" VALUES (7);');
    const snapshot = await source.dumpDataDir('none');
    await source.close();

    // Regression: PGlite ignores the snapshot when its data dir is left
    // undefined, and this silently came back empty.
    handle = await createDb('pglite:memory', { pgliteSnapshot: snapshot });
    const result = (await handle.db.execute(sql`SELECT id FROM "Snap"`)) as unknown as {
      rows: { id: number }[];
    };
    expect(result.rows).toEqual([{ id: 7 }]);
  });

  it('persists nothing between separate in-memory databases', async () => {
    handle = await createDb('pglite:memory');
    await handle.db.execute(sql`CREATE TABLE "OnlyHere" (id int)`);

    const other = await createDb('pglite:memory');
    try {
      const result = (await other.db.execute(
        sql`SELECT count(*) AS c FROM pg_tables WHERE tablename = 'OnlyHere'`,
      )) as unknown as { rows: { c: number }[] };
      expect(result.rows[0].c).toBe(0);
    } finally {
      await other.close();
    }
  });
});
