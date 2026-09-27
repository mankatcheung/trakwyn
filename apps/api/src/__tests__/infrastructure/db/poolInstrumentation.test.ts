import { EventEmitter } from 'node:events';
import pg from 'pg';
import { describe, it, expect, vi } from 'vitest';
import { DATABASE } from '#src/infrastructure/config/constants.js';
import {
  POOL_ACQUIRE_TIMEOUT,
  acquireTimeoutPhase,
  instrumentPool,
  type InstrumentablePool,
} from '#src/infrastructure/db/poolInstrumentation.js';
import { makeFakeMetrics } from '#src/__tests__/helpers/fakeMetrics.js';
import { makeLogger } from '#src/__tests__/helpers/mocks/infrastructure.js';

const queueTimeout = () => new Error(POOL_ACQUIRE_TIMEOUT.QUEUED_MESSAGE);
const connectTimeout = () => new Error(POOL_ACQUIRE_TIMEOUT.CONNECTING_MESSAGE);

/** A pool whose `connect` does whatever the test says, with counts it can set. */
function makeFakePool(
  connect: InstrumentablePool['connect'],
  counts = { totalCount: 10, idleCount: 0, waitingCount: 5 },
): InstrumentablePool {
  return { connect, ...counts };
}

describe('acquireTimeoutPhase', () => {
  it("tells pg-pool's two acquire timeouts apart", () => {
    expect(acquireTimeoutPhase(queueTimeout())).toBe('queued');
    expect(acquireTimeoutPhase(connectTimeout())).toBe('connecting');
  });

  it('is null for every other failure, so those stay generic database errors', () => {
    expect(acquireTimeoutPhase(new Error('relation "Nope" does not exist'))).toBeNull();
    expect(acquireTimeoutPhase(POOL_ACQUIRE_TIMEOUT.QUEUED_MESSAGE)).toBeNull();
    expect(acquireTimeoutPhase(undefined)).toBeNull();
  });
});

describe('instrumentPool (JEF-372)', () => {
  it('counts and logs a queued timeout from the promise form, and still rejects with it', async () => {
    const err = queueTimeout();
    const pool = makeFakePool(vi.fn().mockRejectedValue(err));
    const logger = makeLogger();
    const metrics = makeFakeMetrics();
    instrumentPool(pool, { logger, metrics });

    await expect(pool.connect()).rejects.toBe(err);

    expect(metrics.databasePoolAcquireTimeouts).toEqual(['queued']);
    // The counts at that moment explain the timeout; nothing about the query does.
    expect(logger.warn).toHaveBeenCalledWith(
      'Postgres pool: timed out acquiring a connection',
      err,
      {
        event: POOL_ACQUIRE_TIMEOUT.EVENT,
        phase: 'queued',
        inUse: 10,
        idle: 0,
        waiting: 5,
        max: DATABASE.POOL_MAX,
      },
    );
  });

  it('counts a connecting timeout from the callback form, which pool.query uses', () => {
    const err = connectTimeout();
    const pool = makeFakePool(((cb: (e: Error) => void) => cb(err)) as never);
    const metrics = makeFakeMetrics();
    instrumentPool(pool, { logger: makeLogger(), metrics });

    const callback = vi.fn();
    (pool.connect as (cb: typeof callback) => void)(callback);

    expect(callback).toHaveBeenCalledWith(err, undefined, undefined);
    expect(metrics.databasePoolAcquireTimeouts).toEqual(['connecting']);
  });

  it('leaves other connect failures uncounted and unlogged', async () => {
    const pool = makeFakePool(
      vi.fn().mockRejectedValue(new Error('password authentication failed')),
    );
    const logger = makeLogger();
    const metrics = makeFakeMetrics();
    instrumentPool(pool, { logger, metrics });

    await expect(pool.connect()).rejects.toThrow('password authentication failed');

    expect(metrics.databasePoolAcquireTimeouts).toEqual([]);
    expect(logger.warn).not.toHaveBeenCalled();
  });

  it('hands a checked-out client through untouched', async () => {
    const client = { release: vi.fn() };
    const pool = makeFakePool(vi.fn().mockResolvedValue(client));
    instrumentPool(pool, { logger: makeLogger(), metrics: makeFakeMetrics() });

    await expect(pool.connect()).resolves.toBe(client);
  });

  it('registers the gauge once, on the first checkout, reading the live counts', async () => {
    const counts = { totalCount: 2, idleCount: 2, waitingCount: 0 };
    const pool = makeFakePool(vi.fn().mockResolvedValue({}), counts);
    const metrics = makeFakeMetrics();
    instrumentPool(pool, { logger: makeLogger(), metrics });

    // Lazily, like the counters: nothing before the SDK has had to be running.
    expect(metrics.databasePoolObservers).toHaveLength(0);

    await pool.connect();
    await pool.connect();
    expect(metrics.databasePoolObservers).toHaveLength(1);

    const [read] = metrics.databasePoolObservers;
    expect(read()).toEqual({ total: 2, idle: 2, waiting: 0 });

    // A read at export time, not a copy from registration time.
    Object.assign(pool, { totalCount: 10, idleCount: 0, waitingCount: 7 });
    expect(read()).toEqual({ total: 10, idle: 0, waiting: 7 });
  });

  /**
   * The messages are pg-pool's, matched as strings because it sets no
   * `code`. This drives the installed pg-pool into both timeouts, so an
   * upgrade that rewords either fails here rather than silently zeroing the
   * counter and its monitor.
   */
  it("recognises the installed pg-pool's own timeout errors, through pool.query as well", async () => {
    // A client whose connection never completes; pg-pool calls end() on it
    // when connectionTimeoutMillis passes, which fails the pending connect.
    class HangingClient extends EventEmitter {
      private onConnect?: (err?: Error) => void;
      connect(cb: (err?: Error) => void) {
        this.onConnect = cb;
      }
      isConnected() {
        return false;
      }
      end() {
        this.onConnect?.(new Error('ended'));
      }
    }

    const pool = new pg.Pool({
      max: 1,
      connectionTimeoutMillis: 20,
      Client: HangingClient as unknown as typeof pg.Client,
    });
    const metrics = makeFakeMetrics();
    instrumentPool(pool, { logger: makeLogger(), metrics });

    // The first checkout opens the pool's only client, which hangs; the
    // query arrives with the pool full and queues behind it.
    const first = pool.connect();
    const second = pool.query('SELECT 1');

    await expect(first).rejects.toThrow(POOL_ACQUIRE_TIMEOUT.CONNECTING_MESSAGE);
    await expect(second).rejects.toThrow(POOL_ACQUIRE_TIMEOUT.QUEUED_MESSAGE);
    expect([...metrics.databasePoolAcquireTimeouts].sort()).toEqual(['connecting', 'queued']);

    await pool.end();
  });
});
