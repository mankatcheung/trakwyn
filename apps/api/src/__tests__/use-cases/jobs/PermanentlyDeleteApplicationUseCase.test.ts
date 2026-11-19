import { describe, it, expect, vi } from 'vitest';
import { PermanentlyDeleteApplicationUseCase } from '#src/use-cases/jobs/PermanentlyDeleteApplicationUseCase.js';
import { ForbiddenError, NotFoundError } from '#src/use-cases/errors/DomainError.js';
import {
  makeDocument,
  makeDocumentRepository,
  makeStorageProvider,
} from '#src/__tests__/helpers/mocks/documents.js';
import { makeApplication, makeApplicationRepository } from '#src/__tests__/helpers/mocks/jobs.js';

const makeUseCase = (over: Record<string, unknown> = {}) => {
  const applicationRepository = makeApplicationRepository({
    findByIdIncludingTrashed: vi.fn().mockResolvedValue(makeApplication({ userId: 'user-1' })),
  });
  const documentRepository = makeDocumentRepository({
    findAllByApplicationId: vi.fn().mockResolvedValue([]),
  });
  const storageProvider = makeStorageProvider();
  const deps = { applicationRepository, documentRepository, storageProvider, ...over };
  return { useCase: new PermanentlyDeleteApplicationUseCase(deps as never), ...deps };
};

describe('PermanentlyDeleteApplicationUseCase', () => {
  it('finds the application even though it is in Trash', async () => {
    const ctx = makeUseCase();

    await ctx.useCase.execute({ userId: 'user-1', applicationId: 'app-1' });

    // findById filters trashed rows out, so using it here would report every
    // trashed application as missing and nothing would ever be purged.
    expect(ctx.applicationRepository.findByIdIncludingTrashed).toHaveBeenCalledWith('app-1');
  });

  it('deletes the documents in one storage call before deleting the application', async () => {
    const order: string[] = [];
    const ctx = makeUseCase({
      documentRepository: makeDocumentRepository({
        findAllByApplicationId: vi
          .fn()
          .mockResolvedValue([
            makeDocument({ storageKey: 'a' }),
            makeDocument({ storageKey: 'b' }),
          ]),
      }),
      storageProvider: makeStorageProvider({
        // One batched call, not one round trip per blob: emptying a large
        // Trash runs this per application inside a serverless request.
        deleteMany: vi.fn().mockImplementation((keys: string[]) => {
          order.push(`blobs:${keys.join(',')}`);
          return Promise.resolve();
        }),
      }),
      applicationRepository: makeApplicationRepository({
        findByIdIncludingTrashed: vi.fn().mockResolvedValue(makeApplication({ userId: 'user-1' })),
        delete: vi.fn().mockImplementation(() => {
          order.push('row');
          return Promise.resolve();
        }),
      }),
    });

    await ctx.useCase.execute({ userId: 'user-1', applicationId: 'app-1' });

    // Row first would lose the storage keys to the cascade and orphan the
    // files, which nothing would ever notice.
    expect(order).toEqual(['blobs:a,b', 'row']);
    expect(ctx.storageProvider.deleteMany).toHaveBeenCalledTimes(1);
  });

  it('refuses an application belonging to someone else', async () => {
    const ctx = makeUseCase({
      applicationRepository: makeApplicationRepository({
        findByIdIncludingTrashed: vi
          .fn()
          .mockResolvedValue(makeApplication({ userId: 'someone-else' })),
      }),
    });

    await expect(
      ctx.useCase.execute({ userId: 'user-1', applicationId: 'app-1' }),
    ).rejects.toBeInstanceOf(ForbiddenError);
    expect(ctx.storageProvider.deleteMany).not.toHaveBeenCalled();
  });

  it('throws NOT_FOUND for an application that is not there at all', async () => {
    const ctx = makeUseCase({
      applicationRepository: makeApplicationRepository({
        findByIdIncludingTrashed: vi.fn().mockResolvedValue(null),
      }),
    });

    await expect(
      ctx.useCase.execute({ userId: 'user-1', applicationId: 'app-1' }),
    ).rejects.toBeInstanceOf(NotFoundError);
  });
});
