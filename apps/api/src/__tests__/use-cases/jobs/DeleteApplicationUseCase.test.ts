import { describe, it, expect, vi } from 'vitest';
import { DeleteApplicationUseCase } from '#src/use-cases/jobs/DeleteApplicationUseCase.js';
import { ForbiddenError, NotFoundError } from '#src/use-cases/errors/DomainError.js';
import { makeApplication, makeApplicationRepository } from '#src/__tests__/helpers/mocks/jobs.js';

const NOW = new Date('2026-08-20T12:00:00.000Z');

describe('DeleteApplicationUseCase', () => {
  it('throws NOT_FOUND when the application does not exist', async () => {
    const applicationRepository = makeApplicationRepository({
      findById: vi.fn().mockResolvedValue(null),
    });

    const useCase = new DeleteApplicationUseCase({ applicationRepository, now: () => NOW });

    await expect(
      useCase.execute({ userId: 'user-1', applicationId: 'app-1' }),
    ).rejects.toBeInstanceOf(NotFoundError);
    expect(applicationRepository.softDelete).not.toHaveBeenCalled();
  });

  it('throws FORBIDDEN when the application belongs to another user', async () => {
    const applicationRepository = makeApplicationRepository({
      findById: vi.fn().mockResolvedValue(makeApplication({ userId: 'someone-else' })),
    });

    const useCase = new DeleteApplicationUseCase({ applicationRepository, now: () => NOW });

    await expect(
      useCase.execute({ userId: 'user-1', applicationId: 'app-1' }),
    ).rejects.toBeInstanceOf(ForbiddenError);
    expect(applicationRepository.softDelete).not.toHaveBeenCalled();
  });

  it('moves it to Trash rather than deleting it', async () => {
    const applicationRepository = makeApplicationRepository({
      findById: vi.fn().mockResolvedValue(makeApplication({ userId: 'user-1' })),
    });

    const useCase = new DeleteApplicationUseCase({ applicationRepository, now: () => NOW });
    await useCase.execute({ userId: 'user-1', applicationId: 'app-1' });

    expect(applicationRepository.softDelete).toHaveBeenCalledWith('app-1', NOW);
    expect(applicationRepository.delete).not.toHaveBeenCalled();
  });

  it('does not touch storage — the blobs have to survive for a restore to mean anything', () => {
    // This use case used to delete every document from storage before removing
    // the row. That moved to PermanentlyDeleteApplicationUseCase: deleting the
    // files here would leave a restored application pointing at nothing.
    const deps = Object.keys(
      new DeleteApplicationUseCase({
        applicationRepository: makeApplicationRepository(),
        now: () => NOW,
      }) as unknown as Record<string, unknown>,
    );

    expect(deps).not.toContain('storageProvider');
  });
});
