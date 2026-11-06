import type { IGetCompanyBriefingUseCase } from '#src/use-cases/companyBriefing/GetCompanyBriefingUseCase.js';
import type { GenerateCompanyBriefingUseCase } from '#src/use-cases/companyBriefing/GenerateCompanyBriefingUseCase.js';
import type {
  CompanyBriefingMapper,
  CompanyBriefingDTO,
} from '#src/interface-adapters/mappers/CompanyBriefingMapper.js';

interface Deps {
  getCompanyBriefingUseCase: IGetCompanyBriefingUseCase;
  generateCompanyBriefingUseCase: GenerateCompanyBriefingUseCase;
  companyBriefingMapper: CompanyBriefingMapper;
}

export class CompanyBriefingResolver {
  constructor(private readonly deps: Deps) {}

  async getCompanyBriefing(
    userId: string,
    applicationId: string,
  ): Promise<CompanyBriefingDTO | null> {
    const briefing = await this.deps.getCompanyBriefingUseCase.execute({ userId, applicationId });
    return briefing ? this.deps.companyBriefingMapper.toDTO(briefing) : null;
  }

  async generateCompanyBriefing(
    userId: string,
    applicationId: string,
    instructions?: string | null,
  ): Promise<CompanyBriefingDTO> {
    const briefing = await this.deps.generateCompanyBriefingUseCase.execute({
      userId,
      applicationId,
      instructions,
    });
    return this.deps.companyBriefingMapper.toDTO(briefing);
  }
}
