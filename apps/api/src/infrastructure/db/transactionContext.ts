import { AsyncLocalStorage } from 'node:async_hooks';
import type { DrizzleDb, DrizzleTransaction, DrizzleClient } from './client.js';

export const txStorage = new AsyncLocalStorage<DrizzleTransaction>();

export function getClient(db: DrizzleDb): DrizzleClient {
  return txStorage.getStore() ?? db;
}

/** Work waiting for the ambient transaction to commit. Set by `DrizzleTransactionManager`. */
export const afterCommitStorage = new AsyncLocalStorage<Array<() => Promise<void>>>();

/**
 * Runs `task` once the current transaction has committed, or now when there is
 * none. On rollback it never runs, since nothing changed.
 *
 * For cache eviction (JEF-694): an entry dropped while the transaction is still
 * open can be read again, and re-cached, from the row as it was before.
 */
export async function runAfterCommit(task: () => Promise<void>): Promise<void> {
  const pending = afterCommitStorage.getStore();
  if (pending) pending.push(task);
  else await task();
}
