import { describe, it, expect, vi } from 'vitest';
import { AI_PROMPT_INPUT } from '#src/use-cases/constants.js';
import type {
  CompanyResearch,
  ICompanyResearchSource,
} from '#src/use-cases/ports/ICompanyResearchSource.js';
import { GenerateCompanyBriefingUseCase } from '#src/use-cases/companyBriefing/GenerateCompanyBriefingUseCase.js';
import { makeLogger, makeRateLimiter } from '#src/__tests__/helpers/mocks/infrastructure.js';
import { makeApplication, makeApplicationRepository } from '#src/__tests__/helpers/mocks/jobs.js';
import {
  makeCompanyBriefingRepository,
  makeCompanyResearchSource,
  makeCompanySearchDeps,
  makeLLMProvider,
  makeLLMProviderFactory,
} from '#src/__tests__/helpers/mocks/llm.js';
import {
  makeEntitlementService,
  makeFreeEntitlementService,
} from '#src/__tests__/helpers/mocks/plans.js';
import { makeUser, makeUserRepository } from '#src/__tests__/helpers/mocks/user.js';

const SITE: CompanyResearch = {
  pages: [{ url: 'https://acme.test/', title: 'Acme home', text: 'Acme sells payroll software.' }],
};

const SEARCH: CompanyResearch = {
  pages: [
    {
      url: 'https://news.test/acme-series-b',
      title: 'Acme raises Series B',
      text: 'Acme raised a Series B.',
      publishedAt: '2026-03-12T00:00:00.000Z',
    },
    {
      url: 'https://reviews.test/acme',
      title: 'Acme reviews',
      text: 'Reviewers describe a flat team.',
      publishedAt: null,
    },
  ],
};

const searchSource = (found: CompanyResearch | null = SEARCH): ICompanyResearchSource => ({
  research: vi.fn().mockResolvedValue(found),
});

function setup(
  search: Parameters<typeof makeCompanySearchDeps>[0],
  site: ICompanyResearchSource = makeCompanyResearchSource({
    research: vi.fn().mockResolvedValue(SITE),
  }),
) {
  const llmProvider = makeLLMProvider('briefing');
  const companyBriefingRepository = makeCompanyBriefingRepository();
  const searchDeps = makeCompanySearchDeps(search);
  const useCase = new GenerateCompanyBriefingUseCase({
    applicationRepository: makeApplicationRepository({
      findById: vi.fn().mockResolvedValue(
        makeApplication({
          company: 'Acme',
          jobUrl: 'https://careers.acme.test/jobs/1',
        }),
      ),
    }),
    llmProviderFactory: makeLLMProviderFactory({
      forUser: vi.fn().mockResolvedValue(llmProvider),
    }),
    userRepository: makeUserRepository({ findById: vi.fn().mockResolvedValue(makeUser()) }),
    generateCompanyBriefingRateLimiter: makeRateLimiter(),
    companyBriefingRepository,
    companyResearchSource: site,
    ...searchDeps,
    generateId: () => 'briefing-1',
    now: () => new Date('2026-11-09T00:00:00.000Z'),
  });
  const userPrompt = (): string => {
    const [messages] = vi.mocked(llmProvider.complete).mock.calls[0];
    return messages[messages.length - 1].content;
  };
  return { useCase, companyBriefingRepository, searchDeps, userPrompt };
}

const run = (useCase: GenerateCompanyBriefingUseCase) =>
  useCase.execute({ applicationId: 'app-1', userId: 'user-1' });

describe('GenerateCompanyBriefingUseCase web search (JEF-538)', () => {
  it('numbers the search results after the company pages and saves their dates', async () => {
    const source = searchSource();
    const { useCase, companyBriefingRepository, userPrompt } = setup({
      companySearchSource: source,
    });

    await run(useCase);

    expect(source.research).toHaveBeenCalledWith({
      company: 'Acme',
      jobUrl: 'https://careers.acme.test/jobs/1',
    });
    expect(userPrompt()).toContain('Company website pages:');
    expect(userPrompt()).toContain('Web search results:');
    expect(userPrompt()).toContain(
      '[2] Acme raises Series B (https://news.test/acme-series-b) — published 2026-03-12',
    );
    expect(userPrompt()).toContain('[3] Acme reviews (https://reviews.test/acme) — date unknown');
    expect(companyBriefingRepository.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        sources: [
          { url: 'https://acme.test/', title: 'Acme home' },
          {
            url: 'https://news.test/acme-series-b',
            title: 'Acme raises Series B',
            publishedAt: '2026-03-12T00:00:00.000Z',
          },
          { url: 'https://reviews.test/acme', title: 'Acme reviews', publishedAt: null },
        ],
      }),
    );
  });

  it('searches for a Pro user and spends one of their daily searches', async () => {
    const limiter = makeRateLimiter();
    const { useCase } = setup({
      companySearchSource: searchSource(),
      companyWebSearchRateLimiter: limiter,
    });

    await run(useCase);

    expect(limiter.consume).toHaveBeenCalledExactlyOnceWith('company-web-search:user:user-1');
  });

  it('skips search for a Free user, who keeps the briefing and keeps their allowance', async () => {
    const source = searchSource();
    const limiter = makeRateLimiter();
    const logger = makeLogger();
    const { useCase, companyBriefingRepository, userPrompt } = setup({
      companySearchSource: source,
      companyWebSearchRateLimiter: limiter,
      entitlementService: makeFreeEntitlementService(),
      logger,
    });

    await run(useCase);

    expect(source.research).not.toHaveBeenCalled();
    expect(limiter.consume).not.toHaveBeenCalled();
    expect(userPrompt()).not.toContain('Web search results');
    expect(companyBriefingRepository.upsert).toHaveBeenCalledOnce();
    expect(logger.info).toHaveBeenCalledWith(
      'Company briefing research',
      expect.objectContaining({ searchOutcome: 'skipped-plan', searchPages: 0, sitePages: 1 }),
    );
  });

  it('skips search past the daily limit instead of refusing the briefing', async () => {
    const source = searchSource();
    const logger = makeLogger();
    const { useCase, companyBriefingRepository } = setup({
      companySearchSource: source,
      companyWebSearchRateLimiter: makeRateLimiter({ consume: vi.fn().mockResolvedValue(false) }),
      logger,
    });

    await expect(run(useCase)).resolves.toBeDefined();

    expect(source.research).not.toHaveBeenCalled();
    expect(companyBriefingRepository.upsert).toHaveBeenCalledOnce();
    expect(logger.info).toHaveBeenCalledWith(
      'Company briefing research',
      expect.objectContaining({ searchOutcome: 'skipped-limit' }),
    );
  });

  it('makes no entitlement or limit call when no provider is configured', async () => {
    const entitlementService = makeEntitlementService();
    const limiter = makeRateLimiter();
    const logger = makeLogger();
    const { useCase } = setup({
      companySearchSource: null,
      entitlementService,
      companyWebSearchRateLimiter: limiter,
      logger,
    });

    await run(useCase);

    expect(entitlementService.forUserId).not.toHaveBeenCalled();
    expect(limiter.consume).not.toHaveBeenCalled();
    expect(logger.info).toHaveBeenCalledWith(
      'Company briefing research',
      expect.objectContaining({ searchOutcome: 'skipped-unconfigured' }),
    );
  });

  it('still writes the briefing when the search throws', async () => {
    const logger = makeLogger();
    const { useCase, companyBriefingRepository, userPrompt } = setup({
      companySearchSource: { research: vi.fn().mockRejectedValue(new Error('Tavily is down')) },
      logger,
    });

    await expect(run(useCase)).resolves.toBeDefined();

    expect(userPrompt()).not.toContain('Web search results');
    expect(companyBriefingRepository.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ sources: [{ url: 'https://acme.test/', title: 'Acme home' }] }),
    );
    expect(logger.info).toHaveBeenCalledWith(
      'Company briefing research',
      expect.objectContaining({ searchOutcome: 'failed' }),
    );
  });

  it('still writes the briefing when reading the plan throws', async () => {
    const source = searchSource();
    const { useCase } = setup({
      companySearchSource: source,
      entitlementService: makeEntitlementService({
        forUserId: vi.fn().mockRejectedValue(new Error('database down')),
      }),
    });

    await expect(run(useCase)).resolves.toBeDefined();
    expect(source.research).not.toHaveBeenCalled();
  });

  it('uses the search alone when the company site could not be read', async () => {
    const { useCase, companyBriefingRepository, userPrompt } = setup(
      { companySearchSource: searchSource() },
      makeCompanyResearchSource(),
    );

    await run(useCase);

    expect(userPrompt()).not.toContain('Company website pages');
    expect(userPrompt()).toContain('[1] Acme raises Series B');
    expect(companyBriefingRepository.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        sources: [
          expect.objectContaining({ url: 'https://news.test/acme-series-b' }),
          expect.objectContaining({ url: 'https://reviews.test/acme' }),
        ],
      }),
    );
  });

  it('keeps the two budgets apart: a long search never takes the company pages room', async () => {
    const long = (n: number) => ({
      url: `https://news.test/${n}`,
      title: `Result ${n}`,
      text: 'x'.repeat(AI_PROMPT_INPUT.COMPANY_BRIEFING_SEARCH_MAX_CHARS),
      publishedAt: null,
    });
    const { useCase, companyBriefingRepository } = setup({
      companySearchSource: searchSource({ pages: [long(1), long(2)] }),
    });

    await run(useCase);

    // The second result does not fit once the first used the whole budget.
    expect(companyBriefingRepository.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        sources: [
          { url: 'https://acme.test/', title: 'Acme home' },
          { url: 'https://news.test/1', title: 'Result 1', publishedAt: null },
        ],
      }),
    );
  });

  it('logs counts and an outcome, never the company or what was found', async () => {
    const logger = makeLogger();
    const { useCase } = setup({ companySearchSource: searchSource(), logger });

    await run(useCase);

    const logged = JSON.stringify(vi.mocked(logger.info).mock.calls);
    expect(logged).toContain('"searchOutcome":"hit"');
    expect(logged).not.toContain('Acme');
    expect(logged).not.toContain('Series B');
  });
});
