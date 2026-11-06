import { describe, it, expect, vi } from 'vitest';
import { CompanyBriefingResolver } from '#src/interface-adapters/resolvers/CompanyBriefingResolver.js';
import type { CompanyBriefingMapper } from '#src/interface-adapters/mappers/CompanyBriefingMapper.js';
import type { GenerateCompanyBriefingUseCase } from '#src/use-cases/companyBriefing/GenerateCompanyBriefingUseCase.js';
import type { IGetCompanyBriefingUseCase } from '#src/use-cases/companyBriefing/GetCompanyBriefingUseCase.js';

const BRIEFING = {
  id: 'b1',
  applicationId: 'app-1',
  content: 'Overview',
  generatedAt: new Date('2026-08-21T00:00:00.000Z'),
};

function makeResolver() {
  const execute = vi.fn().mockResolvedValue(BRIEFING);
  const toDTO = vi.fn().mockReturnValue({ id: 'b1' });
  const resolver = new CompanyBriefingResolver({
    getCompanyBriefingUseCase: { execute: vi.fn() } as unknown as IGetCompanyBriefingUseCase,
    generateCompanyBriefingUseCase: { execute } as unknown as GenerateCompanyBriefingUseCase,
    companyBriefingMapper: { toDTO } as unknown as CompanyBriefingMapper,
  });
  return { resolver, execute, toDTO };
}

describe('CompanyBriefingResolver.generateCompanyBriefing', () => {
  it('passes the optional instructions to the use case and maps the briefing (JEF-507)', async () => {
    const { resolver, execute, toDTO } = makeResolver();

    const result = await resolver.generateCompanyBriefing('user-1', 'app-1', 'remote culture');

    expect(execute).toHaveBeenCalledWith({
      userId: 'user-1',
      applicationId: 'app-1',
      instructions: 'remote culture',
    });
    expect(toDTO).toHaveBeenCalledWith(BRIEFING);
    expect(result).toEqual({ id: 'b1' });
  });

  it('works without instructions, as older clients call it', async () => {
    const { resolver, execute } = makeResolver();

    await resolver.generateCompanyBriefing('user-1', 'app-1');

    expect(execute).toHaveBeenCalledWith({
      userId: 'user-1',
      applicationId: 'app-1',
      instructions: undefined,
    });
  });
});
