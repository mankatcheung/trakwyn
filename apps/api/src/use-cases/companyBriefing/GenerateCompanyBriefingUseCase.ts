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
import type { IEntitlementService } from '#src/use-cases/ports/IEntitlementService.js';
import type { ILogger } from '#src/use-cases/ports/ILogger.js';
import type { ICompanyBriefingRepository } from '#src/use-cases/ports/ICompanyBriefingRepository.js';
import type { CompanyBriefing } from '#src/domain/companyBriefing/CompanyBriefing.js';
import {
  companyBriefingPrompt,
  type BriefingResearchPage,
} from '#src/use-cases/prompts/companyBriefing.js';
import { normaliseAiInstructions } from '#src/use-cases/shared/aiInstructions.js';
import { AI_FEATURE, AI_PROMPT_INPUT, AI_REASONING_DEFAULTS } from '#src/use-cases/constants.js';
import type { ICompanyResearchSource } from '#src/use-cases/ports/ICompanyResearchSource.js';
import { fitResearch } from '#src/use-cases/companyBriefing/fitResearch.js';

export interface GenerateCompanyBriefingInput {
  applicationId: string;
  userId: string;
  /** The user's own steer, e.g. "focus on remote culture". Fenced as data. */
  instructions?: string | null;
}

interface Deps {
  llmProviderFactory: ILLMProviderFactory;
  applicationRepository: IApplicationRepository;
  userRepository: IUserRepository;
  generateCompanyBriefingRateLimiter: IRateLimiter;
  companyBriefingRepository: ICompanyBriefingRepository;
  companyResearchSource: ICompanyResearchSource;
  /** The paid web search (JEF-538); `null` when the instance has none configured. */
  companySearchSource: ICompanyResearchSource | null;
  companyWebSearchRateLimiter: IRateLimiter;
  entitlementService: IEntitlementService;
  logger: ILogger;
  generateId: () => string;
  now: () => Date;
}

export class GenerateCompanyBriefingUseCase {
  constructor(private readonly deps: Deps) {}

  async execute(input: GenerateCompanyBriefingInput): Promise<CompanyBriefing> {
    const instructions = normaliseAiInstructions(input.instructions);
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
    const [site, search] = await Promise.all([
      this.readCompanySite(app),
      this.readWebSearch(app, input.userId),
    ]);
    // The company's own pages are numbered first, so a citation to [1] is the
    // company speaking for itself and the search results follow.
    const pages: BriefingResearchPage[] = [...site, ...search.pages];
    const research = pages.length > 0 ? pages : null;
    this.deps.logger.info('Company briefing research', {
      event: 'companyBriefing.research',
      sitePages: site.length,
      searchOutcome: search.outcome,
      searchPages: search.pages.length,
    });
    const messages = companyBriefingPrompt.build({
      app,
      instructions,
      research,
      customAiPrompt: user?.customAiPrompt,
    });

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
      sources: pages.map(({ url, title, publishedAt }) =>
        // Only a search result has a date; a page from the company's site
        // keeps the two-field shape it had before search existed.
        publishedAt === undefined ? { url, title } : { url, title, publishedAt },
      ),
      generatedAt: this.deps.now(),
    });
  }

  /**
   * What the company's own site says, or no pages to brief from the model's
   * general knowledge as before. Research is an improvement, not a
   * precondition: a source that throws is treated like one with nothing, so
   * an unreachable site never costs the user a briefing.
   */
  private async readCompanySite(app: {
    company: string;
    jobUrl: string | null;
  }): Promise<BriefingResearchPage[]> {
    try {
      const found = await this.deps.companyResearchSource.research({
        company: app.company,
        jobUrl: app.jobUrl,
      });
      const pages = found
        ? fitResearch(found.pages, AI_PROMPT_INPUT.COMPANY_BRIEFING_RESEARCH_MAX_CHARS)
        : [];
      return pages.map((page) => ({ ...page, kind: 'site' as const }));
    } catch {
      return [];
    }
  }

  /**
   * What others say about the company, from a search Trakwyn pays for
   * (JEF-538). Pro only, and limited per user, so it is skipped, never
   * refused: a Free user, a user past the limit, an instance with no key and a
   * provider that is down all get the briefing they would have had without
   * search. The entitlement is read before the limit so a Free user does not
   * spend the allowance, and every failure (the entitlement read included)
   * ends as `failed` rather than as an error.
   */
  private async readWebSearch(
    app: { company: string; jobUrl: string | null },
    userId: string,
  ): Promise<{ pages: BriefingResearchPage[]; outcome: SearchOutcome }> {
    const source = this.deps.companySearchSource;
    if (!source) return { pages: [], outcome: 'skipped-unconfigured' };

    try {
      const { features } = await this.deps.entitlementService.forUserId(userId);
      if (!features.companyWebResearch) return { pages: [], outcome: 'skipped-plan' };

      if (
        !(await this.deps.companyWebSearchRateLimiter.consume(`company-web-search:user:${userId}`))
      ) {
        return { pages: [], outcome: 'skipped-limit' };
      }

      const found = await source.research({ company: app.company, jobUrl: app.jobUrl });
      const pages = found
        ? fitResearch(found.pages, AI_PROMPT_INPUT.COMPANY_BRIEFING_SEARCH_MAX_CHARS)
        : [];
      return {
        pages: pages.map((page) => ({
          ...page,
          // A dated source and an undated one are both searched ones: `null`,
          // not absent, is what marks a result whose date is unknown.
          publishedAt: page.publishedAt ?? null,
          kind: 'search' as const,
        })),
        outcome: pages.length > 0 ? 'hit' : 'miss',
      };
    } catch {
      return { pages: [], outcome: 'failed' };
    }
  }
}

/** What happened to the paid search for one briefing. A log field, never shown to the user. */
type SearchOutcome =
  'hit' | 'miss' | 'failed' | 'skipped-plan' | 'skipped-limit' | 'skipped-unconfigured';
