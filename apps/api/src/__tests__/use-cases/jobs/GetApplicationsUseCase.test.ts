import { describe, it, expect, vi } from 'vitest';
import { GetApplicationsUseCase } from '#src/use-cases/jobs/GetApplicationsUseCase.js';
import { makeApplication, makeApplicationRepository } from '#src/__tests__/helpers/mocks/jobs.js';

describe('GetApplicationsUseCase', () => {
  it('returns all applications for the user', async () => {
    const apps = [makeApplication({ id: 'app-1' }), makeApplication({ id: 'app-2' })];
    const applicationRepository = makeApplicationRepository({
      findAllByUserId: vi.fn().mockResolvedValue(apps),
    });

    const useCase = new GetApplicationsUseCase({ applicationRepository });
    const result = await useCase.execute({ userId: 'user-1' });

    expect(result).toEqual(apps);
    expect(applicationRepository.findAllByUserId).toHaveBeenCalledWith('user-1', {
      status: undefined,
    });
  });

  it('passes the status filter through to the repository', async () => {
    const apps = [makeApplication({ status: 'interviewing' })];
    const applicationRepository = makeApplicationRepository({
      findAllByUserId: vi.fn().mockResolvedValue(apps),
    });

    const useCase = new GetApplicationsUseCase({ applicationRepository });
    const result = await useCase.execute({ userId: 'user-1', status: 'interviewing' });

    expect(result).toEqual(apps);
    expect(applicationRepository.findAllByUserId).toHaveBeenCalledWith('user-1', {
      status: 'interviewing',
    });
  });

  it('returns an empty array when the user has no applications', async () => {
    const applicationRepository = makeApplicationRepository({
      findAllByUserId: vi.fn().mockResolvedValue([]),
    });

    const useCase = new GetApplicationsUseCase({ applicationRepository });
    const result = await useCase.execute({ userId: 'user-1' });

    expect(result).toEqual([]);
  });
});
