import { describe, it, expect, vi } from 'vitest';
import { BulkAddTagToApplicationsUseCase } from '#src/use-cases/jobs/BulkAddTagToApplicationsUseCase.js';
import { makeApplication, makeApplicationRepository } from '#src/__tests__/helpers/mocks/jobs.js';
import type { IUpdateApplicationUseCase } from '#src/use-cases/jobs/IUpdateApplicationUseCase.js';

const stub = <T>(methods: Partial<T>): T => methods as T;

describe('BulkAddTagToApplicationsUseCase', () => {
  it('rejects an empty id list', async () => {
    const applicationRepository = makeApplicationRepository();
    const updateApplicationUseCase = stub<IUpdateApplicationUseCase>({ execute: vi.fn() });
    const useCase = new BulkAddTagToApplicationsUseCase({
      applicationRepository,
      updateApplicationUseCase,
      generateId: () => 'tag-id',
    });

    const err = await useCase
      .execute({ userId: 'user-1', applicationIds: [], tag: 'urgent' })
      .catch((e) => e);

    expect((err as { code: string }).code).toBe('VALIDATION');
  });

  it('throws NOT_FOUND when an application does not exist', async () => {
    const applicationRepository = makeApplicationRepository({
      findById: vi.fn().mockResolvedValue(null),
    });
    const updateApplicationUseCase = stub<IUpdateApplicationUseCase>({ execute: vi.fn() });
    const useCase = new BulkAddTagToApplicationsUseCase({
      applicationRepository,
      updateApplicationUseCase,
      generateId: () => 'tag-id',
    });

    const err = await useCase
      .execute({ userId: 'user-1', applicationIds: ['app-missing'], tag: 'urgent' })
      .catch((e) => e);

    expect((err as { code: string }).code).toBe('NOT_FOUND');
    expect(updateApplicationUseCase.execute).not.toHaveBeenCalled();
  });

  it('throws FORBIDDEN when an application belongs to another user', async () => {
    const applicationRepository = makeApplicationRepository({
      findById: vi.fn().mockResolvedValue(makeApplication({ userId: 'other-user' })),
    });
    const updateApplicationUseCase = stub<IUpdateApplicationUseCase>({ execute: vi.fn() });
    const useCase = new BulkAddTagToApplicationsUseCase({
      applicationRepository,
      updateApplicationUseCase,
      generateId: () => 'tag-id',
    });

    const err = await useCase
      .execute({ userId: 'user-1', applicationIds: ['app-1'], tag: 'urgent' })
      .catch((e) => e);

    expect((err as { code: string }).code).toBe('FORBIDDEN');
    expect(updateApplicationUseCase.execute).not.toHaveBeenCalled();
  });

  it('merges the tag into each application’s existing tags without duplicating it', async () => {
    const apps: Record<string, ReturnType<typeof makeApplication>> = {
      'app-1': makeApplication({ id: 'app-1', tags: ['backend'] }),
      'app-2': makeApplication({ id: 'app-2', tags: ['urgent'] }),
    };
    const applicationRepository = makeApplicationRepository({
      findById: vi.fn().mockImplementation((id: string) => Promise.resolve(apps[id])),
    });
    const updateApplicationUseCase = stub<IUpdateApplicationUseCase>({
      execute: vi.fn().mockResolvedValue(makeApplication()),
    });
    const useCase = new BulkAddTagToApplicationsUseCase({
      applicationRepository,
      updateApplicationUseCase,
      generateId: () => 'tag-id',
    });

    await useCase.execute({
      userId: 'user-1',
      applicationIds: ['app-1', 'app-2'],
      tag: 'urgent',
    });

    expect(updateApplicationUseCase.execute).toHaveBeenCalledWith({
      userId: 'user-1',
      applicationId: 'app-1',
      tags: ['backend', 'urgent'],
    });
    expect(updateApplicationUseCase.execute).toHaveBeenCalledWith({
      userId: 'user-1',
      applicationId: 'app-2',
      tags: ['urgent'],
    });
  });
});
