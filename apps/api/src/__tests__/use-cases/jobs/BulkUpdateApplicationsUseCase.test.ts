import { describe, it, expect, vi } from 'vitest';
import { BulkUpdateApplicationsUseCase } from '#src/use-cases/jobs/BulkUpdateApplicationsUseCase.js';
import { makeTransactionManager } from '#src/__tests__/helpers/mocks/infrastructure.js';
import { makeApplication } from '#src/__tests__/helpers/mocks/jobs.js';
import type { IUpdateApplicationUseCase } from '#src/use-cases/jobs/IUpdateApplicationUseCase.js';

const stub = <T>(methods: Partial<T>): T => methods as T;

describe('BulkUpdateApplicationsUseCase', () => {
  it('rejects an empty id list', async () => {
    const updateApplicationUseCase = stub<IUpdateApplicationUseCase>({ execute: vi.fn() });
    const useCase = new BulkUpdateApplicationsUseCase({ updateApplicationUseCase });

    const err = await useCase
      .execute({ userId: 'user-1', applicationIds: [], status: 'applied' })
      .catch((e) => e);

    expect((err as { code: string }).code).toBe('VALIDATION');
    expect(updateApplicationUseCase.execute).not.toHaveBeenCalled();
  });

  it('rejects more ids than the configured max', async () => {
    const updateApplicationUseCase = stub<IUpdateApplicationUseCase>({ execute: vi.fn() });
    const useCase = new BulkUpdateApplicationsUseCase({ updateApplicationUseCase });
    const applicationIds = Array.from({ length: 201 }, (_, i) => `app-${i}`);

    const err = await useCase
      .execute({ userId: 'user-1', applicationIds, status: 'applied' })
      .catch((e) => e);

    expect((err as { code: string }).code).toBe('VALIDATION');
    expect(updateApplicationUseCase.execute).not.toHaveBeenCalled();
  });

  it('calls updateApplicationUseCase for every id with the same status/starred', async () => {
    const updateApplicationUseCase = stub<IUpdateApplicationUseCase>({
      execute: vi
        .fn()
        .mockImplementation(({ applicationId }) =>
          Promise.resolve(makeApplication({ id: applicationId, status: 'interviewing' })),
        ),
    });
    const useCase = new BulkUpdateApplicationsUseCase({ updateApplicationUseCase });

    const result = await useCase.execute({
      userId: 'user-1',
      applicationIds: ['app-1', 'app-2'],
      status: 'interviewing',
    });

    expect(updateApplicationUseCase.execute).toHaveBeenCalledWith({
      userId: 'user-1',
      applicationId: 'app-1',
      status: 'interviewing',
      starred: undefined,
    });
    expect(updateApplicationUseCase.execute).toHaveBeenCalledWith({
      userId: 'user-1',
      applicationId: 'app-2',
      status: 'interviewing',
      starred: undefined,
    });
    expect(result).toHaveLength(2);
  });

  it('propagates a per-item error (e.g. FORBIDDEN for one id) and rejects the whole batch', async () => {
    const updateApplicationUseCase = stub<IUpdateApplicationUseCase>({
      execute: vi.fn().mockImplementation(({ applicationId }) => {
        if (applicationId === 'app-2') {
          return Promise.reject(Object.assign(new Error('Forbidden'), { code: 'FORBIDDEN' }));
        }
        return Promise.resolve(makeApplication({ id: applicationId }));
      }),
    });
    const useCase = new BulkUpdateApplicationsUseCase({ updateApplicationUseCase });

    const err = await useCase
      .execute({ userId: 'user-1', applicationIds: ['app-1', 'app-2'], starred: true })
      .catch((e) => e);

    expect((err as { code: string }).code).toBe('FORBIDDEN');
  });

  it('wraps the batch in a single transaction when transactionManager is provided', async () => {
    const updateApplicationUseCase = stub<IUpdateApplicationUseCase>({
      execute: vi.fn().mockResolvedValue(makeApplication()),
    });
    const transactionManager = makeTransactionManager();
    const useCase = new BulkUpdateApplicationsUseCase({
      updateApplicationUseCase,
      transactionManager,
    });

    await useCase.execute({ userId: 'user-1', applicationIds: ['app-1', 'app-2'], starred: true });

    expect(transactionManager.run).toHaveBeenCalledOnce();
    expect(updateApplicationUseCase.execute).toHaveBeenCalledTimes(2);
  });
});
