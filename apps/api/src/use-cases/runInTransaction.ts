import type { ITransactionManager } from '#src/use-cases/ports/ITransactionManager.js';

/**
 * Runs `fn` inside the ambient transaction when a manager is wired, and plainly
 * otherwise (unit tests that mock repositories construct use cases without one).
 * Throwing inside `fn` rolls back every repository write it made, so only put
 * writes that must stand or fall together in it, and keep side effects with
 * other systems (email, storage) outside.
 */
export function runInTransaction<T>(
  transactionManager: ITransactionManager | undefined,
  fn: () => Promise<T>,
): Promise<T> {
  return transactionManager ? transactionManager.run(fn) : fn();
}
