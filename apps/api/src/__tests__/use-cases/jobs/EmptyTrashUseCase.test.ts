import { describe, it, expect, vi } from 'vitest';
import { EmptyTrashUseCase } from '#src/use-cases/jobs/EmptyTrashUseCase.js';
import { makeLogger } from '#src/__tests__/helpers/mocks/infrastructure.js';
import { makeApplication, makeApplicationRepository } from '#src/__tests__/helpers/mocks/jobs.js';
import type { IPermanentlyDeleteApplicationUseCase } from '#src/use-cases/jobs/IPermanentlyDeleteApplicationUseCase.js';

const makePermanentDelete = (execute = vi.fn().mockResolvedValue(undefined)) =>
  ({ execute }) as unknown as IPermanentlyDeleteApplicationUseCase;

const trashed = [
  makeApplication({ id: 'app-1', userId: 'user-1', deletedAt: new Date('2026-08-01') }),
  makeApplication({ id: 'app-2', userId: 'user-1', deletedAt: new Date('2026-08-02') }),
];

describe('EmptyTrashUseCase', () => {
  it('permanently deletes everything in the users Trash', async () => {
    const applicationRepository = makeApplicationRepository({
      findTrashedByUserId: vi.fn().mockResolvedValue(trashed),
    });
    const permanentlyDeleteApplicationUseCase = makePermanentDelete();
    const useCase = new EmptyTrashUseCase({
      applicationRepository,
      permanentlyDeleteApplicationUseCase,
      logger: makeLogger(),
    });

    const result = await useCase.execute({ userId: 'user-1' });

    expect(result).toEqual({ deleted: 2, failed: 0 });
    expect(applicationRepository.findTrashedByUserId).toHaveBeenCalledWith('user-1');
    expect(permanentlyDeleteApplicationUseCase.execute).toHaveBeenCalledWith({
      userId: 'user-1',
      applicationId: 'app-1',
    });
  });

  it('is a no-op on an empty Trash', async () => {
    const applicationRepository = makeApplicationRepository({
      findTrashedByUserId: vi.fn().mockResolvedValue([]),
    });
    const permanentlyDeleteApplicationUseCase = makePermanentDelete();
    const useCase = new EmptyTrashUseCase({
      applicationRepository,
      permanentlyDeleteApplicationUseCase,
      logger: makeLogger(),
    });

    const result = await useCase.execute({ userId: 'user-1' });

    expect(result).toEqual({ deleted: 0, failed: 0 });
    expect(permanentlyDeleteApplicationUseCase.execute).not.toHaveBeenCalled();
  });

  it('keeps going past a failure and reports the split', async () => {
    // The point of the counts: a half-emptied Trash should say so rather than
    // surface one generic error over a list that is now partly gone.
    const execute = vi
      .fn()
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new Error('storage unreachable'));
    const applicationRepository = makeApplicationRepository({
      findTrashedByUserId: vi.fn().mockResolvedValue(trashed),
    });
    const logger = makeLogger();
    const useCase = new EmptyTrashUseCase({
      applicationRepository,
      permanentlyDeleteApplicationUseCase: makePermanentDelete(execute),
      logger,
    });

    const result = await useCase.execute({ userId: 'user-1' });

    expect(result).toEqual({ deleted: 1, failed: 1 });
    expect(logger.error).toHaveBeenCalled();
  });

  it('deletes each application as its own owner rather than skipping the check', async () => {
    const permanentlyDeleteApplicationUseCase = makePermanentDelete();
    const applicationRepository = makeApplicationRepository({
      findTrashedByUserId: vi.fn().mockResolvedValue(trashed),
    });
    const useCase = new EmptyTrashUseCase({
      applicationRepository,
      permanentlyDeleteApplicationUseCase,
      logger: makeLogger(),
    });

    await useCase.execute({ userId: 'user-1' });

    for (const call of vi.mocked(permanentlyDeleteApplicationUseCase.execute).mock.calls) {
      expect(call[0].userId).toBe('user-1');
    }
  });
});
