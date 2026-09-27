import type pg from 'pg';
import { DATABASE } from '#src/infrastructure/config/constants.js';
import type {
  DatabasePoolState,
  IMetrics,
  PoolAcquirePhase,
} from '#src/infrastructure/observability/metrics.js';
import type { ILogger } from '#src/use-cases/ports/ILogger.js';

/**
 * pg-pool's two acquire-timeout errors, and the log event for either
 * (JEF-372). Matched by message because pg-pool sets no `code`;
 * `poolInstrumentation.test.ts` pins both against the installed pg-pool.
 *
 * Kept beside their only reader rather than in `DATABASE`, as `METRICS` is.
 */
export const POOL_ACQUIRE_TIMEOUT = {
  /** A queued request never got a free client: the pool was saturated. */
  QUEUED_MESSAGE: 'timeout exceeded when trying to connect',
  /** Opening a new client took too long, e.g. Neon waking from zero. */
  CONNECTING_MESSAGE: 'Connection terminated due to connection timeout',
  EVENT: 'db.pool.acquire_timeout',
} as const;

/** The parts of a `pg.Pool` this module reads or wraps — a fake satisfies it in tests. */
export type InstrumentablePool = Pick<
  pg.Pool,
  'connect' | 'totalCount' | 'idleCount' | 'waitingCount'
>;

type ConnectCallback = (
  err: Error | undefined,
  client: pg.PoolClient | undefined,
  done: (release?: unknown) => void,
) => void;

export function readPoolState(pool: InstrumentablePool): DatabasePoolState {
  return { total: pool.totalCount, idle: pool.idleCount, waiting: pool.waitingCount };
}

/**
 * Which acquire timeout `err` is, or null for any other failure. pg-pool
 * gives neither a `code`, so the message is all there is to go on.
 */
export function acquireTimeoutPhase(err: unknown): PoolAcquirePhase | null {
  if (!(err instanceof Error)) return null;
  if (err.message === POOL_ACQUIRE_TIMEOUT.QUEUED_MESSAGE) return 'queued';
  if (err.message === POOL_ACQUIRE_TIMEOUT.CONNECTING_MESSAGE) return 'connecting';
  return null;
}

/**
 * Measures pool saturation (JEF-372): reports the pool's counts as gauges,
 * and counts and logs every query that timed out waiting for a connection.
 *
 * Every checkout goes through `pool.connect`, including the ones `pool.query`
 * makes for Drizzle's plain queries (it calls `this.connect`), so wrapping
 * that one method sees them all. Without this the wait for a connection is
 * invisible: it happens before the `pg` query span starts, and the timeout
 * reaches the client as a generic INTERNAL_ERROR.
 *
 * The gauge is registered on the first checkout rather than here, the same
 * lazy rule the counters follow (metrics.ts): by then the OTel SDK is
 * certainly running.
 */
export function instrumentPool(
  pool: InstrumentablePool,
  { logger, metrics }: { logger: ILogger; metrics: IMetrics },
): void {
  const connect = pool.connect.bind(pool) as (callback?: ConnectCallback) => unknown;
  let observing = false;

  const onFailure = (err: unknown): void => {
    const phase = acquireTimeoutPhase(err);
    if (!phase) return;
    metrics.recordDatabasePoolAcquireTimeout(phase);
    const { total, idle, waiting } = readPoolState(pool);
    // Counts only: a connect error carries no SQL and no parameters, and
    // nothing about the query that was waiting is added here.
    logger.warn('Postgres pool: timed out acquiring a connection', err, {
      event: POOL_ACQUIRE_TIMEOUT.EVENT,
      phase,
      inUse: total - idle,
      idle,
      waiting,
      max: DATABASE.POOL_MAX,
    });
  };

  const instrumented = (callback?: ConnectCallback): unknown => {
    if (!observing) {
      observing = true;
      metrics.observeDatabasePool(() => readPoolState(pool));
    }
    if (callback) {
      return connect((err, client, done) => {
        if (err) onFailure(err);
        callback(err, client, done);
      });
    }
    return (connect() as Promise<pg.PoolClient>).catch((err: unknown) => {
      onFailure(err);
      throw err;
    });
  };

  pool.connect = instrumented as pg.Pool['connect'];
}
