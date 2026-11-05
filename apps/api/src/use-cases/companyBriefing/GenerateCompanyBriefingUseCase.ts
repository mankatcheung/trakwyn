import {
  AiNotConfiguredError,
  ForbiddenError,
  NotFoundError,
  RateLimitedError,
} from '#src/use-cases/errors/DomainError.js';
import type { ILLMProviderFactory } from '#src/use-cases/ports/ILLMProviderFactory.js';
import type { IApplicationRepository } from '#src/use-cases/ports/IApplicationRepository.js';
import type { IUserRepository } from '#src/use-cases/ports/IUserRepository.js';
import type { IRateLimiter } from '#src/use-cases/ports/IRateLimiter.js';
import type { ICompanyBriefingRepository } from '#src/use-cases/ports/ICompanyBriefingRepository.js';
import type { CompanyBriefing } from '#src/domain/companyBriefing/CompanyBriefing.js';
import { companyBriefingPrompt } from '#src/use-cases/prompts/companyBriefing.js';
import { AI_FEATURE, AI_REASONING_DEFAULTS } from '#src/use-cases/constants.js';

export interface GenerateCompanyBriefingInput {
  applicationId: string;
  userId: string;
}

interface Deps {
  llmProviderFactory: ILLMProviderFactory;
  applicationRepository: IApplicationRepository;
  userRepository: IUserRepository;
  generateCompanyBriefingRateLimiter: IRateLimiter;
  companyBriefingRepository: ICompanyBriefingRepository;
  generateId: () => string;
  now: () => Date;
}

export class GenerateCompanyBriefingUseCase {
  constructor(private readonly deps: Deps) {}

  async execute(input: GenerateCompanyBriefingInput): Promise<CompanyBriefing> {
    if (
      !(await this.deps.generateCompanyBriefingRateLimiter.consume(
        `company-briefing:user:${input.userId}`,
      ))
    ) {
      throw new RateLimitedError('Too many requests — please wait a moment and try again');
    }

    const app = await this.deps.applicationRepository.findById(input.applicationId);
    if (!app) {
      throw new NotFoundError('Application not found');
    }
    if (app.userId !== input.userId) {
      throw new ForbiddenError('Forbidden');
    }

    const llmProvider = await this.deps.llmProviderFactory.forUser(input.userId, {
      feature: AI_FEATURE.COMPANY_BRIEFING,
      promptVersion: companyBriefingPrompt.version,
    });
    if (!llmProvider) {
      throw new AiNotConfiguredError('Add your AI API key in Settings to use this feature');
    }

    const user = await this.deps.userRepository.findById(input.userId);
    const messages = companyBriefingPrompt.build({ app, customAiPrompt: user?.customAiPrompt });

    const { content } = await llmProvider.complete(messages, 768, undefined, {
      reasoning: AI_REASONING_DEFAULTS.COMPANY_BRIEFING,
    });

    // Persisted rather than returned and forgotten (JEF-195). Upsert, not
    // insert: one briefing per application, and regenerating replaces it.
    // Only reached on success, so a failed call leaves the previous briefing
    // intact rather than blanking it.
    return this.deps.companyBriefingRepository.upsert({
      id: this.deps.generateId(),
      applicationId: input.applicationId,
      content,
      generatedAt: this.deps.now(),
    });
  }
}
