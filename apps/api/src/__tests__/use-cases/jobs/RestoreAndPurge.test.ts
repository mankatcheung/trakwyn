import { describe, it, expect, vi } from 'vitest';
import { RestoreApplicationUseCase } from '#src/use-cases/jobs/RestoreApplicationUseCase.js';
import { PurgeExpiredApplicationsUseCase } from '#src/use-cases/jobs/PurgeExpiredApplicationsUseCase.js';
import { ForbiddenError, NotFoundError } from '#src/use-cases/errors/DomainError.js';
import { makeApplication, makeApplicationRepository } from '#src/__tests__/helpers/mocks/jobs.js';
import { TRASH } from '#src/use-cases/constants.js';

const NOW = new Date('2026-08-20T12:00:00.000Z');
const trashed = (over = {}) =>
  makeApplication({ userId: 'user-1', deletedAt: new Date('2026-08-01T00:00:00.000Z'), ...over });

describe('RestoreApplicationUseCase', () => {
  it('restores an application from Trash', async () => {
    const applicationRepository = makeApplicationRepository({
      findByIdIncludingTrashed: vi.fn().mockResolvedValue(trashed()),
    });

    await new RestoreApplicationUseCase({ applicationRepository }).execute({
      userId: 'user-1',
      applicationId: 'app-1',
    });

    expect(applicationRepository.restore).toHaveBeenCalledWith('app-1');
  });

  it('refuses one that is not actually in Trash', async () => {
    const applicationRepository = makeApplicationRepository({
      findByIdIncludingTrashed: vi.fn().mockResolvedValue(makeApplication({ deletedAt: null })),
    });

    await expect(
      new RestoreApplicationUseCase({ applicationRepository }).execute({
        userId: 'user-1',
        applicationId: 'app-1',
      }),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it("refuses someone else's", async () => {
    const applicationRepository = makeApplicationRepository({
      findByIdIncludingTrashed: vi.fn().mockResolvedValue(trashed({ userId: 'someone-else' })),
    });

    await expect(
      new RestoreApplicationUseCase({ applicationRepository }).execute({
        userId: 'user-1',
        applicationId: 'app-1',
      }),
    ).rejects.toBeInstanceOf(ForbiddenError);
    expect(applicationRepository.restore).not.toHaveBeenCalled();
  });
});

describe('PurgeExpiredApplicationsUseCase', () => {
  const makeCtx = (over: Record<string, unknown> = {}) => {
    const applicationRepository = makeApplicationRepository({
      findDueForPurge: vi.fn().mockResolvedValue([]),
    });
    const permanentlyDeleteApplicationUseCase = { execute: vi.fn().mockResolvedValue(undefined) };
    const logger = { error: vi.fn() };
    const deps = {
      applicationRepository,
      permanentlyDeleteApplicationUseCase,
      logger,
      now: () => NOW,
      ...over,
    };
    return { useCase: new PurgeExpiredApplicationsUseCase(deps as never), ...deps };
  };

  it('asks for anything trashed longer ago than the retention window', async () => {
    const ctx = makeCtx();

    await ctx.useCase.execute();

    expect(ctx.applicationRepository.findDueForPurge).toHaveBeenCalledWith(
      new Date(NOW.getTime() - TRASH.RETENTION_MS),
    );
  });

  it("deletes through the owner's own id, not around the ownership check", async () => {
    const ctx = makeCtx({
      applicationRepository: makeApplicationRepository({
        findDueForPurge: vi.fn().mockResolvedValue([makeApplication({ id: 'a', userId: 'owner' })]),
      }),
    });

    await ctx.useCase.execute();

    expect(ctx.permanentlyDeleteApplicationUseCase.execute).toHaveBeenCalledWith({
      userId: 'owner',
      applicationId: 'a',
    });
  });

  it('keeps going after one fails, and reports how many', async () => {
    const ctx = makeCtx({
      applicationRepository: makeApplicationRepository({
        findDueForPurge: vi
          .fn()
          .mockResolvedValue([
            makeApplication({ id: 'a' }),
            makeApplication({ id: 'bad' }),
            makeApplication({ id: 'c' }),
          ]),
      }),
      permanentlyDeleteApplicationUseCase: {
        execute: vi
          .fn()
          .mockImplementation(({ applicationId }: { applicationId: string }) =>
            applicationId === 'bad'
              ? Promise.reject(new Error('blob store unreachable'))
              : Promise.resolve(),
          ),
      },
    });

    const result = await ctx.useCase.execute();

    // One unreachable blob should not strand every later application in Trash
    // for another day.
    expect(result).toEqual({ purged: 2, failed: 1 });
    expect(ctx.logger.error).toHaveBeenCalledTimes(1);
  });
});
