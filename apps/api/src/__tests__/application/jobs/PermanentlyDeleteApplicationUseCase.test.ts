import { describe, it, expect, vi } from 'vitest';
import { PermanentlyDeleteApplicationUseCase } from '#src/use-cases/jobs/PermanentlyDeleteApplicationUseCase.js';
import { ForbiddenError, NotFoundError } from '#src/use-cases/errors/DomainError.js';
import {
  makeDocument,
  makeDocumentRepository,
  makeStorageProvider,
} from '#src/__tests__/helpers/mocks/documents.js';
import { makeApplication, makeApplicationRepository } from '#src/__tests__/helpers/mocks/jobs.js';
import {
  makeInterviewRound,
  makeInterviewRoundRepository,
} from '#src/__tests__/helpers/mocks/interviews.js';
import { makeSyncCalendarEventUseCase } from '#src/__tests__/helpers/mocks/calendar.js';

const makeUseCase = (over: Record<string, unknown> = {}) => {
  const applicationRepository = makeApplicationRepository({
    findByIdIncludingTrashed: vi.fn().mockResolvedValue(makeApplication({ userId: 'user-1' })),
  });
  const documentRepository = makeDocumentRepository({
    findAllByApplicationId: vi.fn().mockResolvedValue([]),
  });
  const storageProvider = makeStorageProvider();
  const interviewRoundRepository = makeInterviewRoundRepository({
    findAllByApplicationId: vi.fn().mockResolvedValue([]),
  });
  const syncCalendarEventUseCase = makeSyncCalendarEventUseCase();
  const deps = {
    applicationRepository,
    documentRepository,
    storageProvider,
    interviewRoundRepository,
    syncCalendarEventUseCase,
    ...over,
  };
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

describe('PermanentlyDeleteApplicationUseCase calendar cleanup (JEF-331)', () => {
  it("removes the application's interview events after the delete, using ids read before it", async () => {
    const order: string[] = [];
    const ctx = makeUseCase({
      applicationRepository: makeApplicationRepository({
        findByIdIncludingTrashed: vi.fn().mockResolvedValue(makeApplication({ userId: 'user-1' })),
        delete: vi.fn().mockImplementation(() => {
          order.push('delete');
          return Promise.resolve();
        }),
      }),
      interviewRoundRepository: makeInterviewRoundRepository({
        findAllByApplicationId: vi.fn().mockImplementation(() => {
          order.push('read-rounds');
          return Promise.resolve([
            makeInterviewRound({ id: 'round-1' }),
            makeInterviewRound({ id: 'round-2' }),
          ]);
        }),
      }),
      syncCalendarEventUseCase: makeSyncCalendarEventUseCase({
        removeMany: vi.fn().mockImplementation(() => {
          order.push('calendar');
          return Promise.resolve();
        }),
      }),
    });

    await ctx.useCase.execute({ userId: 'user-1', applicationId: 'app-1' });

    expect(ctx.syncCalendarEventUseCase.removeMany).toHaveBeenCalledWith({
      userId: 'user-1',
      sourceType: 'interview',
      sourceIds: ['round-1', 'round-2'],
    });
    expect(order).toEqual(['read-rounds', 'delete', 'calendar']);
  });

  it('makes no calendar call when ownership is refused', async () => {
    const ctx = makeUseCase();

    await expect(
      ctx.useCase.execute({ userId: 'someone-else', applicationId: 'app-1' }),
    ).rejects.toBeInstanceOf(ForbiddenError);

    expect(ctx.syncCalendarEventUseCase.removeMany).not.toHaveBeenCalled();
    expect(ctx.applicationRepository.delete).not.toHaveBeenCalled();
  });
});
