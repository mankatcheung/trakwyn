import { describe, it, expect, vi } from 'vitest';
import { GetApplicationsPageUseCase } from '#src/use-cases/jobs/GetApplicationsPageUseCase.js';
import { makeApplication, makeApplicationRepository } from '#src/__tests__/helpers/mocks/jobs.js';

describe('GetApplicationsPageUseCase', () => {
  it('passes filters and pagination through to the repository, defaulting the limit', async () => {
    const applicationRepository = makeApplicationRepository({
      findPageByUserId: vi.fn().mockResolvedValue({ items: [], hasNextPage: false }),
    });
    const useCase = new GetApplicationsPageUseCase({ applicationRepository });

    await useCase.execute({ userId: 'user-1', status: 'applied', starred: true, search: 'acme' });

    expect(applicationRepository.findPageByUserId).toHaveBeenCalledWith(
      'user-1',
      { status: 'applied', starred: true, search: 'acme' },
      { cursor: undefined, limit: 20 },
    );
  });

  it('passes the given cursor and limit through unchanged when within bounds', async () => {
    const applicationRepository = makeApplicationRepository({
      findPageByUserId: vi.fn().mockResolvedValue({ items: [], hasNextPage: false }),
    });
    const useCase = new GetApplicationsPageUseCase({ applicationRepository });

    await useCase.execute({ userId: 'user-1', cursor: 'app-5', limit: 50 });

    expect(applicationRepository.findPageByUserId).toHaveBeenCalledWith(
      'user-1',
      { status: undefined, starred: undefined, search: undefined },
      { cursor: 'app-5', limit: 50 },
    );
  });

  it('clamps a limit above the max down to the max', async () => {
    const applicationRepository = makeApplicationRepository({
      findPageByUserId: vi.fn().mockResolvedValue({ items: [], hasNextPage: false }),
    });
    const useCase = new GetApplicationsPageUseCase({ applicationRepository });

    await useCase.execute({ userId: 'user-1', limit: 5000 });

    expect(applicationRepository.findPageByUserId).toHaveBeenCalledWith(
      'user-1',
      expect.anything(),
      { cursor: undefined, limit: 100 },
    );
  });

  it('clamps a limit below 1 up to 1', async () => {
    const applicationRepository = makeApplicationRepository({
      findPageByUserId: vi.fn().mockResolvedValue({ items: [], hasNextPage: false }),
    });
    const useCase = new GetApplicationsPageUseCase({ applicationRepository });

    await useCase.execute({ userId: 'user-1', limit: 0 });

    expect(applicationRepository.findPageByUserId).toHaveBeenCalledWith(
      'user-1',
      expect.anything(),
      { cursor: undefined, limit: 1 },
    );
  });

  it('returns the last item id as nextCursor when there is a next page', async () => {
    const items = [makeApplication({ id: 'app-1' }), makeApplication({ id: 'app-2' })];
    const applicationRepository = makeApplicationRepository({
      findPageByUserId: vi.fn().mockResolvedValue({ items, hasNextPage: true }),
    });
    const useCase = new GetApplicationsPageUseCase({ applicationRepository });

    const result = await useCase.execute({ userId: 'user-1' });

    expect(result).toEqual({ items, hasNextPage: true, nextCursor: 'app-2' });
  });

  it('returns a null nextCursor when there is no next page', async () => {
    const items = [makeApplication({ id: 'app-1' })];
    const applicationRepository = makeApplicationRepository({
      findPageByUserId: vi.fn().mockResolvedValue({ items, hasNextPage: false }),
    });
    const useCase = new GetApplicationsPageUseCase({ applicationRepository });

    const result = await useCase.execute({ userId: 'user-1' });

    expect(result.nextCursor).toBeNull();
  });
});
