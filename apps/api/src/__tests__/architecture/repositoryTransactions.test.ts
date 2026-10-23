import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * A repository that talks to its own `db` instead of `getClient(db)` never
 * joins the transaction a use case opened with `ITransactionManager.run`, so
 * its writes survive a rollback of everything around them (JEF-427:
 * `DrizzlePushSubscriptionRepository` did exactly that). Every concrete
 * repository must therefore resolve its client through `getClient`.
 */
const REPOSITORIES_DIR = path.resolve(import.meta.dirname, '../../infrastructure/db/repositories');

const concreteRepositories = readdirSync(REPOSITORIES_DIR).filter((file) =>
  /^Drizzle.*Repository\.ts$/.test(file),
);

describe('repository transaction participation', () => {
  it('finds the repositories it is meant to guard', () => {
    expect(concreteRepositories.length).toBeGreaterThan(30);
  });

  it.each(concreteRepositories)('%s resolves its client through getClient', (file) => {
    const source = readFileSync(path.join(REPOSITORIES_DIR, file), 'utf8');
    expect(source).toMatch(/\bgetClient\(/);
  });
});
