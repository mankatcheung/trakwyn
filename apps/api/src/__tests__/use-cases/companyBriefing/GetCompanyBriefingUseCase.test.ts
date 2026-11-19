import { describe, it, expect, vi } from 'vitest';
import { GetCompanyBriefingUseCase } from '#src/use-cases/companyBriefing/GetCompanyBriefingUseCase.js';
import { makeApplication, makeApplicationRepository } from '#src/__tests__/helpers/mocks/jobs.js';
import { makeCompanyBriefingRepository } from '#src/__tests__/helpers/mocks/llm.js';

const briefing = {
  id: 'b1',
  applicationId: 'app-1',
  content: 'Company overview…',
  generatedAt: new Date('2026-08-01T00:00:00.000Z'),
};

describe('GetCompanyBriefingUseCase', () => {
  it('returns the stored briefing', async () => {
    const useCase = new GetCompanyBriefingUseCase({
      applicationRepository: makeApplicationRepository({
        findById: vi.fn().mockResolvedValue(makeApplication({ userId: 'user-1' })),
      }),
      companyBriefingRepository: makeCompanyBriefingRepository({
        findByApplicationId: vi.fn().mockResolvedValue(briefing),
      }),
    });

    expect(await useCase.execute({ userId: 'user-1', applicationId: 'app-1' })).toEqual(briefing);
  });

  it('returns null when none has been generated, rather than throwing', async () => {
    const useCase = new GetCompanyBriefingUseCase({
      applicationRepository: makeApplicationRepository({
        findById: vi.fn().mockResolvedValue(makeApplication({ userId: 'user-1' })),
      }),
      companyBriefingRepository: makeCompanyBriefingRepository(),
    });

    expect(await useCase.execute({ userId: 'user-1', applicationId: 'app-1' })).toBeNull();
  });

  it('throws NOT_FOUND for an application that does not exist or is in Trash', async () => {
    const useCase = new GetCompanyBriefingUseCase({
      applicationRepository: makeApplicationRepository({
        findById: vi.fn().mockResolvedValue(null),
      }),
      companyBriefingRepository: makeCompanyBriefingRepository(),
    });

    const err = await useCase.execute({ userId: 'user-1', applicationId: 'app-1' }).catch((e) => e);
    expect((err as { code: string }).code).toBe('NOT_FOUND');
  });

  it("refuses someone else's application", async () => {
    const companyBriefingRepository = makeCompanyBriefingRepository();
    const useCase = new GetCompanyBriefingUseCase({
      applicationRepository: makeApplicationRepository({
        findById: vi.fn().mockResolvedValue(makeApplication({ userId: 'someone-else' })),
      }),
      companyBriefingRepository,
    });

    const err = await useCase.execute({ userId: 'user-1', applicationId: 'app-1' }).catch((e) => e);
    expect((err as { code: string }).code).toBe('FORBIDDEN');
    expect(companyBriefingRepository.findByApplicationId).not.toHaveBeenCalled();
  });
});
