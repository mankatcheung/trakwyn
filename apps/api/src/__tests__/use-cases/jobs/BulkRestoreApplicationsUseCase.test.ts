import { describe, it, expect, vi } from 'vitest';
import { BulkRestoreApplicationsUseCase } from '#src/use-cases/jobs/BulkRestoreApplicationsUseCase.js';
import { NotFoundError, ForbiddenError } from '#src/use-cases/errors/DomainError.js';
import { BULK_ACTIONS } from '#src/use-cases/constants.js';
import type { IRestoreApplicationUseCase } from '#src/use-cases/jobs/IRestoreApplicationUseCase.js';

const makeRestoreUseCase = (execute = vi.fn().mockResolvedValue(undefined)) =>
  ({ execute }) as unknown as IRestoreApplicationUseCase;

describe('BulkRestoreApplicationsUseCase', () => {
  it('restores every id and reports how many came back', async () => {
    const restoreApplicationUseCase = makeRestoreUseCase();
    const useCase = new BulkRestoreApplicationsUseCase({ restoreApplicationUseCase });

    const result = await useCase.execute({ userId: 'user-1', applicationIds: ['a', 'b', 'c'] });

    expect(result).toEqual({ restored: 3 });
    expect(restoreApplicationUseCase.execute).toHaveBeenCalledTimes(3);
    expect(restoreApplicationUseCase.execute).toHaveBeenCalledWith({
      userId: 'user-1',
      applicationId: 'b',
    });
  });

  it('rejects an empty batch', async () => {
    const useCase = new BulkRestoreApplicationsUseCase({
      restoreApplicationUseCase: makeRestoreUseCase(),
    });

    const err = await useCase.execute({ userId: 'user-1', applicationIds: [] }).catch((e) => e);

    expect((err as { code: string }).code).toBe('VALIDATION');
  });

  it('rejects a batch larger than the bulk cap', async () => {
    const useCase = new BulkRestoreApplicationsUseCase({
      restoreApplicationUseCase: makeRestoreUseCase(),
    });
    const ids = Array.from({ length: BULK_ACTIONS.MAX_IDS + 1 }, (_, i) => `app-${i}`);

    const err = await useCase.execute({ userId: 'user-1', applicationIds: ids }).catch((e) => e);

    expect((err as { code: string }).code).toBe('VALIDATION');
  });

  it('treats an id that is not in Trash as an idempotent no-op, not a failure', async () => {
    // A retried bulk restore after a partial success hits this: some of the
    // batch is already back out of Trash. That should not fail the whole call.
    const execute = vi
      .fn()
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new NotFoundError('Application not found in Trash'))
      .mockResolvedValueOnce(undefined);
    const useCase = new BulkRestoreApplicationsUseCase({
      restoreApplicationUseCase: makeRestoreUseCase(execute),
    });

    const result = await useCase.execute({ userId: 'user-1', applicationIds: ['a', 'b', 'c'] });

    // Two actually moved; the count reports that rather than the batch size.
    expect(result).toEqual({ restored: 2 });
  });

  it('propagates a real failure, so someone elses id is never silently skipped', async () => {
    const execute = vi
      .fn()
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new ForbiddenError('Forbidden'));
    const useCase = new BulkRestoreApplicationsUseCase({
      restoreApplicationUseCase: makeRestoreUseCase(execute),
    });

    const err = await useCase
      .execute({ userId: 'user-1', applicationIds: ['a', 'b'] })
      .catch((e) => e);

    expect((err as { code: string }).code).toBe('FORBIDDEN');
  });
});
