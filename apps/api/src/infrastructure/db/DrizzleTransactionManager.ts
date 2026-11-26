import type { ITransactionManager } from '#src/use-cases/ports/ITransactionManager.js';
import type { DrizzleDb } from './client.js';
import { afterCommitStorage, txStorage } from './transactionContext.js';

export class DrizzleTransactionManager implements ITransactionManager {
  private readonly db: DrizzleDb;

  constructor({ db }: { db: DrizzleDb }) {
    this.db = db;
  }

  async run<T>(fn: () => Promise<T>): Promise<T> {
    if (txStorage.getStore()) return fn();
    const tasks: Array<() => Promise<void>> = [];
    const result = await this.db.transaction((tx) =>
      txStorage.run(tx, () => afterCommitStorage.run(tasks, fn)),
    );
    // The writes are committed by now, so a failed task must not report them as failed.
    await Promise.allSettled(tasks.map((task) => task()));
    return result;
  }
}
