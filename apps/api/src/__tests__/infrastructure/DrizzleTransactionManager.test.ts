import { describe, it, expect, vi } from 'vitest';
import { createTestDb } from '#src/__tests__/helpers/createTestDb.js';
import { DrizzleTransactionManager } from '#src/infrastructure/db/DrizzleTransactionManager.js';
import { DrizzleUserRepository } from '#src/infrastructure/db/repositories/DrizzleUserRepository.js';
import { nanoid } from 'nanoid';

describe('DrizzleTransactionManager', () => {
  it('commits all writes when the callback succeeds', async () => {
    const { db, cleanup } = await createTestDb();
    const tm = new DrizzleTransactionManager({ db });
    const userRepo = new DrizzleUserRepository({ db });

    const id = nanoid();
    await tm.run(async () => {
      await userRepo.create({ id, email: `${id}@example.com`, passwordHash: 'hash' });
    });

    const found = await userRepo.findById(id);
    expect(found).not.toBeNull();
    // Stored lowercased (JEF-692); the nanoid has capitals.
    expect(found!.email).toBe(`${id}@example.com`.toLowerCase());
    await cleanup();
  });

  it('rolls back all writes when the callback throws', async () => {
    const { db, cleanup } = await createTestDb();
    const tm = new DrizzleTransactionManager({ db });
    const userRepo = new DrizzleUserRepository({ db });

    const id = nanoid();
    await expect(
      tm.run(async () => {
        await userRepo.create({ id, email: `${id}@example.com`, passwordHash: 'hash' });
        throw new Error('simulated failure');
      }),
    ).rejects.toThrow('simulated failure');

    const found = await userRepo.findById(id);
    expect(found).toBeNull();
    await cleanup();
  });

  it('reuses an ambient transaction when one is already active (no nested transaction)', async () => {
    const { db, cleanup } = await createTestDb();
    const tm = new DrizzleTransactionManager({ db });
    const userRepo = new DrizzleUserRepository({ db });

    let innerRunCount = 0;
    const outerSpy = vi.spyOn(db, 'transaction');

    // Outer transaction runs work + inner tm.run call
    const id = nanoid();
    await tm.run(async () => {
      innerRunCount++;
      await tm.run(async () => {
        innerRunCount++;
        await userRepo.create({ id, email: `${id}@example.com`, passwordHash: 'hash' });
      });
    });

    // Only one real transaction() call should have been made
    expect(outerSpy).toHaveBeenCalledOnce();
    expect(innerRunCount).toBe(2);

    const found = await userRepo.findById(id);
    expect(found).not.toBeNull();
    await cleanup();
  });
});
