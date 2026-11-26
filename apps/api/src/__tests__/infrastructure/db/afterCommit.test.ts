import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { createTestDb, type TestDb } from '#src/__tests__/helpers/createTestDb.js';
import { DrizzleTransactionManager } from '#src/infrastructure/db/DrizzleTransactionManager.js';
import { afterCommit } from '#src/infrastructure/db/transactionContext.js';
import { CachedMcpOAuthTokenRepository } from '#src/infrastructure/db/repositories/CachedMcpOAuthTokenRepository.js';
import { CachedApiTokenRepository } from '#src/infrastructure/db/repositories/CachedApiTokenRepository.js';
import { MemoryCache } from '#src/infrastructure/cache/MemoryCache.js';

describe('afterCommit (JEF-694)', () => {
  let testDb: TestDb;
  let tm: DrizzleTransactionManager;

  beforeAll(async () => {
    testDb = await createTestDb();
    tm = new DrizzleTransactionManager({ db: testDb.db });
  });

  afterAll(async () => {
    await testDb.cleanup();
  });

  it('runs the task once the transaction has committed, nested runs included', async () => {
    const task = vi.fn().mockResolvedValue(undefined);

    await tm.run(async () => {
      await tm.run(async () => afterCommit(task));
      expect(task).not.toHaveBeenCalled();
    });

    expect(task).toHaveBeenCalledOnce();
  });

  it('drops the task on rollback', async () => {
    const task = vi.fn().mockResolvedValue(undefined);

    await expect(
      tm.run(async () => {
        afterCommit(task);
        throw new Error('simulated failure');
      }),
    ).rejects.toThrow('simulated failure');

    expect(task).not.toHaveBeenCalled();
  });

  it('does not fail a committed transaction when a task fails', async () => {
    await expect(
      tm.run(async () => {
        afterCommit(async () => {
          throw new Error('cache down');
        });
        return 'done';
      }),
    ).resolves.toBe('done');
  });

  it('drops an MCP token cached again while its revocation was uncommitted', async () => {
    const live = { tokenHash: 'h', revokedAt: null };
    const findByTokenHash = vi.fn().mockResolvedValue(live);
    const repo = new CachedMcpOAuthTokenRepository({
      drizzleMcpOAuthTokenRepository: {
        findByTokenHash,
        revokeFamily: vi.fn().mockResolvedValue(['h']),
      } as never,
      cache: new MemoryCache(),
    });

    await tm.run(async () => {
      await repo.revokeFamily('family-1', new Date());
      // Another request reads the still-committed, live row and caches it.
      await repo.findByTokenHash('h');
    });
    await repo.findByTokenHash('h');

    expect(findByTokenHash).toHaveBeenCalledTimes(2);
  });

  it('drops an API token cached again while its delete was uncommitted', async () => {
    const token = { id: 'token-1', userId: 'user-1', tokenHash: 'h' };
    const findByTokenHash = vi.fn().mockResolvedValue({ token, userEmail: 'a@b.com' });
    const repo = new CachedApiTokenRepository({
      drizzleApiTokenRepository: {
        findById: vi.fn().mockResolvedValue(token),
        findByTokenHash,
        delete: vi.fn().mockResolvedValue(undefined),
      } as never,
      cache: new MemoryCache(),
    });

    await tm.run(async () => {
      await repo.delete('token-1');
      await repo.findByTokenHash('h');
    });
    await repo.findByTokenHash('h');

    expect(findByTokenHash).toHaveBeenCalledTimes(2);
  });
});
