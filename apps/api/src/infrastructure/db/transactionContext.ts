import { AsyncLocalStorage } from 'node:async_hooks';
import type { DrizzleDb, DrizzleTransaction, DrizzleClient } from './client.js';

export const txStorage = new AsyncLocalStorage<DrizzleTransaction>();

export function getClient(db: DrizzleDb): DrizzleClient {
  return txStorage.getStore() ?? db;
}

/** Work waiting for the ambient transaction to commit. Set by `DrizzleTransactionManager`. */
export const afterCommitStorage = new AsyncLocalStorage<Array<() => Promise<void>>>();

/**
 * Queues `task` for after the commit, and drops it on rollback. Outside a
 * transaction there is nothing to wait for and it is not queued, so the caller
 * does the work immediately as well.
 *
 * For cache eviction (JEF-694): an entry dropped while a transaction is still
 * open can be re-read, and cached again, from the row as it was before.
 */
export function afterCommit(task: () => Promise<void>): void {
  afterCommitStorage.getStore()?.push(task);
}
