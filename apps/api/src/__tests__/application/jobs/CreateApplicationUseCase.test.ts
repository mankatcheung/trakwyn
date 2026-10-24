import { describe, it, expect, vi } from 'vitest';
import { CreateApplicationUseCase } from '#src/use-cases/jobs/CreateApplicationUseCase.js';
import { makeApplication, makeApplicationRepository } from '#src/__tests__/helpers/mocks/jobs.js';
import {
  makeEntitlementService,
  makeFreeEntitlements,
} from '#src/__tests__/helpers/mocks/plans.js';
import { CONTENT_LIMITS } from '#src/use-cases/constants.js';

describe('CreateApplicationUseCase', () => {
  it('creates an application with all provided fields', async () => {
    const created = makeApplication({ company: 'Google', role: 'SWE', status: 'applied' });
    const applicationRepository = makeApplicationRepository({
      create: vi.fn().mockResolvedValue(created),
    });
    const generateId = vi.fn().mockReturnValue('app-1');

    const useCase = new CreateApplicationUseCase({
      applicationRepository,
      entitlementService: makeEntitlementService(),
      generateId,
    });
    const result = await useCase.execute({
      userId: 'user-1',
      company: 'Google',
      role: 'SWE',
      status: 'applied',
      jobUrl: 'https://google.com/jobs/1',
      location: 'Remote',
    });

    expect(result).toEqual(created);
    expect(applicationRepository.create).toHaveBeenCalledWith({
      id: 'app-1',
      userId: 'user-1',
      company: 'Google',
      role: 'SWE',
      status: 'applied',
      jobUrl: 'https://google.com/jobs/1',
      location: 'Remote',
      salaryRange: null,
      description: null,
      starred: false,
      source: null,
      followUpAt: null,
      tags: [],
      applicationLimit: null,
    });
    expect(generateId).toHaveBeenCalled();
  });

  it('defaults status to "draft" when not provided', async () => {
    const applicationRepository = makeApplicationRepository({
      create: vi.fn().mockResolvedValue(makeApplication()),
    });
    const generateId = vi.fn().mockReturnValue('app-1');

    const useCase = new CreateApplicationUseCase({
      applicationRepository,
      entitlementService: makeEntitlementService(),
      generateId,
    });
    await useCase.execute({ userId: 'user-1', company: 'Acme', role: 'Dev' });

    expect(applicationRepository.create).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'draft' }),
    );
  });

  it('coerces undefined optional fields to null', async () => {
    const applicationRepository = makeApplicationRepository({
      create: vi.fn().mockResolvedValue(makeApplication()),
    });

    const useCase = new CreateApplicationUseCase({
      applicationRepository,
      entitlementService: makeEntitlementService(),
      generateId: vi.fn().mockReturnValue('app-1'),
    });
    await useCase.execute({ userId: 'user-1', company: 'Acme', role: 'Dev' });

    expect(applicationRepository.create).toHaveBeenCalledWith(
      expect.objectContaining({
        jobUrl: null,
        location: null,
        salaryRange: null,
        description: null,
      }),
    );
  });

  it('uses the generateId function for the application id and tag ids', async () => {
    const applicationRepository = makeApplicationRepository({
      create: vi.fn().mockResolvedValue(makeApplication()),
    });
    const generateId = vi.fn().mockReturnValue('generated-id');

    const useCase = new CreateApplicationUseCase({
      applicationRepository,
      entitlementService: makeEntitlementService(),
      generateId,
    });
    await useCase.execute({
      userId: 'user-1',
      company: 'Acme',
      role: 'Dev',
      tags: ['remote', 'senior'],
    });

    expect(generateId).toHaveBeenCalledTimes(3);
    expect(applicationRepository.create).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'generated-id',
        tags: [
          { id: 'generated-id', name: 'remote' },
          { id: 'generated-id', name: 'senior' },
        ],
      }),
    );
  });

  describe('application limit from the plan', () => {
    it("passes the user's own entitlement to the repository", async () => {
      const applicationRepository = makeApplicationRepository({
        create: vi.fn().mockResolvedValue(makeApplication()),
      });
      const entitlementService = makeEntitlementService({
        forUserId: vi.fn().mockResolvedValue(makeFreeEntitlements()),
      });

      const useCase = new CreateApplicationUseCase({
        applicationRepository,
        entitlementService,
        generateId: vi.fn().mockReturnValue('app-1'),
      });
      await useCase.execute({ userId: 'user-9', company: 'Acme', role: 'Dev' });

      expect(entitlementService.forUserId).toHaveBeenCalledWith('user-9');
      expect(applicationRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({ applicationLimit: CONTENT_LIMITS.APPLICATIONS_PER_USER }),
      );
    });

    it('passes no cap for a plan without one', async () => {
      const applicationRepository = makeApplicationRepository({
        create: vi.fn().mockResolvedValue(makeApplication()),
      });

      const useCase = new CreateApplicationUseCase({
        applicationRepository,
        entitlementService: makeEntitlementService(),
        generateId: vi.fn().mockReturnValue('app-1'),
      });
      await useCase.execute({ userId: 'user-1', company: 'Acme', role: 'Dev' });

      expect(applicationRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({ applicationLimit: null }),
      );
    });
  });
});
