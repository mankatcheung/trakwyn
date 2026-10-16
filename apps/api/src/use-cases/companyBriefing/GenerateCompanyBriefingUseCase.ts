import {
  AiNotConfiguredError,
  ForbiddenError,
  NotFoundError,
  RateLimitedError,
} from '#src/use-cases/errors/DomainError.js';
import type { ILLMProviderFactory } from '#src/use-cases/ports/ILLMProviderFactory.js';
import type { LLMMessage } from '#src/use-cases/ports/ILLMProvider.js';
import type { IApplicationRepository } from '#src/use-cases/ports/IApplicationRepository.js';
import type { IUserRepository } from '#src/use-cases/ports/IUserRepository.js';
import type { IRateLimiter } from '#src/use-cases/ports/IRateLimiter.js';
import type { ICompanyBriefingRepository } from '#src/use-cases/ports/ICompanyBriefingRepository.js';
import type { CompanyBriefing } from '#src/domain/companyBriefing/CompanyBriefing.js';
import { wrapUntrustedContent } from '#src/use-cases/shared/wrapUntrustedContent.js';
import { AI_PROMPT_INPUT } from '#src/use-cases/constants.js';

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

const SYSTEM_PROMPT = `You are a career research assistant preparing a candidate for a job application. Given a company, role, and job description, write a concise pre-interview briefing covering:

1. Company overview — what the company does, in a sentence or two.
2. Culture signals — what's likely true about how this company operates, based on its industry, size, and the tone of the job description.
3. Likely interview style — what kind of interview process a company like this typically runs (e.g. take-home vs. live coding, panel vs. 1:1, how many rounds).
4. Talking points — 3-5 specific things the candidate could bring up to show genuine interest and preparation.

Do NOT include a "recent news" section or reference specific current events, funding rounds, layoffs, leadership changes, or anything time-sensitive — you have no reliable access to real-time information, and presenting stale or fabricated "recent" facts as current would be actively misleading. If you don't have confident general knowledge of the company, say so plainly rather than guessing specifics.

Format the briefing as markdown: one "## " heading per section, bullet lists for the talking points and any other lists, and bold for key facts. Do not wrap the response in a code block.`;

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

    const llmProvider = await this.deps.llmProviderFactory.forUser(input.userId);
    if (!llmProvider) {
      throw new AiNotConfiguredError('Add your AI API key in Settings to use this feature');
    }

    const user = await this.deps.userRepository.findById(input.userId);
    const userPrompt = this.buildPrompt(app);

    const messages: LLMMessage[] = [{ role: 'system', content: SYSTEM_PROMPT }];
    if (user?.customAiPrompt) {
      messages.push({ role: 'system', content: user.customAiPrompt });
    }
    messages.push({ role: 'user', content: userPrompt });

    const { content } = await llmProvider.complete(messages, 768);

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

  private buildPrompt(app: {
    company: string;
    role: string;
    location?: string | null;
    description?: string | null;
  }): string {
    const lines = [
      `Prepare a briefing for this application:`,
      `Company: ${app.company}`,
      `Role: ${app.role}`,
      ...(app.location ? [`Location: ${app.location}`] : []),
      ...(app.description
        ? [
            `\nJob description:\n${wrapUntrustedContent(app.description.slice(0, AI_PROMPT_INPUT.COMPANY_BRIEFING_JOB_DESCRIPTION_MAX_CHARS))}`,
          ]
        : []),
    ];

    return lines.join('\n');
  }
}
