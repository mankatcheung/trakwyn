import { describe, it, expect, vi } from 'vitest';
import { GetApplicationUseCase } from '#src/use-cases/jobs/GetApplicationUseCase.js';
import { makeApplication, makeApplicationRepository } from '#src/__tests__/helpers/mocks/jobs.js';

describe('GetApplicationUseCase', () => {
  it('throws NOT_FOUND when the application does not exist', async () => {
    const applicationRepository = makeApplicationRepository({
      findById: vi.fn().mockResolvedValue(null),
    });

    const useCase = new GetApplicationUseCase({ applicationRepository });
    const err = await useCase
      .execute({ userId: 'user-1', applicationId: 'app-missing' })
      .catch((e) => e);

    expect(err).toBeInstanceOf(Error);
    expect((err as { code: string }).code).toBe('NOT_FOUND');
  });

  it('throws FORBIDDEN when the application belongs to another user', async () => {
    const applicationRepository = makeApplicationRepository({
      findById: vi.fn().mockResolvedValue(makeApplication({ userId: 'other-user' })),
    });

    const useCase = new GetApplicationUseCase({ applicationRepository });
    const err = await useCase.execute({ userId: 'user-1', applicationId: 'app-1' }).catch((e) => e);

    expect(err).toBeInstanceOf(Error);
    expect((err as { code: string }).code).toBe('FORBIDDEN');
  });

  it('returns the application when it exists and belongs to the user', async () => {
    const app = makeApplication();
    const applicationRepository = makeApplicationRepository({
      findById: vi.fn().mockResolvedValue(app),
    });

    const useCase = new GetApplicationUseCase({ applicationRepository });
    const result = await useCase.execute({ userId: 'user-1', applicationId: 'app-1' });

    expect(result).toEqual(app);
    expect(applicationRepository.findById).toHaveBeenCalledWith('app-1');
  });
  it('reads through findById by default, so a trashed application is not found', async () => {
    const applicationRepository = makeApplicationRepository({
      // findById filters out trashed rows at the repository boundary.
      findById: vi.fn().mockResolvedValue(null),
      findByIdIncludingTrashed: vi.fn().mockResolvedValue(makeApplication()),
    });

    const useCase = new GetApplicationUseCase({ applicationRepository });
    const err = await useCase.execute({ userId: 'user-1', applicationId: 'app-1' }).catch((e) => e);

    expect((err as { code: string }).code).toBe('NOT_FOUND');
    expect(applicationRepository.findByIdIncludingTrashed).not.toHaveBeenCalled();
  });

  it('returns a trashed application when includeTrashed is set', async () => {
    const app = makeApplication({ deletedAt: new Date('2026-08-01T00:00:00.000Z') });
    const applicationRepository = makeApplicationRepository({
      findById: vi.fn().mockResolvedValue(null),
      findByIdIncludingTrashed: vi.fn().mockResolvedValue(app),
    });

    const useCase = new GetApplicationUseCase({ applicationRepository });
    const result = await useCase.execute({
      userId: 'user-1',
      applicationId: 'app-1',
      includeTrashed: true,
    });

    expect(result).toEqual(app);
    expect(applicationRepository.findById).not.toHaveBeenCalled();
    expect(applicationRepository.findByIdIncludingTrashed).toHaveBeenCalledWith('app-1');
  });

  it('still enforces ownership when includeTrashed is set', async () => {
    const applicationRepository = makeApplicationRepository({
      findByIdIncludingTrashed: vi
        .fn()
        .mockResolvedValue(makeApplication({ userId: 'other-user', deletedAt: new Date() })),
    });

    const useCase = new GetApplicationUseCase({ applicationRepository });
    const err = await useCase
      .execute({ userId: 'user-1', applicationId: 'app-1', includeTrashed: true })
      .catch((e) => e);

    expect((err as { code: string }).code).toBe('FORBIDDEN');
  });
});
