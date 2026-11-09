import { describe, it, expect, vi } from 'vitest';
import { GenerateCompanyBriefingUseCase } from '#src/use-cases/companyBriefing/GenerateCompanyBriefingUseCase.js';
import { makeRateLimiter } from '#src/__tests__/helpers/mocks/infrastructure.js';
import { makeApplication, makeApplicationRepository } from '#src/__tests__/helpers/mocks/jobs.js';
import {
  makeCompanyBriefingRepository,
  makeCompanyResearchSource,
  makeCompanySearchDeps,
  makeLLMProvider,
  makeLLMProviderFactory,
} from '#src/__tests__/helpers/mocks/llm.js';
import { makeUser, makeUserRepository } from '#src/__tests__/helpers/mocks/user.js';

/** The exact messages the company briefing use case sends (JEF-505). */
describe('GenerateCompanyBriefingUseCase prompt messages', () => {
  it.each([null, 'Keep it under 150 words.'])(
    'sends the research assistant prompt (custom prompt: %s)',
    async (customAiPrompt) => {
      const llmProvider = makeLLMProvider('briefing');
      await new GenerateCompanyBriefingUseCase({
        applicationRepository: makeApplicationRepository({
          findById: vi.fn().mockResolvedValue(
            makeApplication({
              company: 'Acme',
              role: 'Engineer',
              location: 'Remote',
              description: 'We build great software.',
            }),
          ),
        }),
        llmProviderFactory: makeLLMProviderFactory({
          forUser: vi.fn().mockResolvedValue(llmProvider),
        }),
        userRepository: makeUserRepository({
          findById: vi.fn().mockResolvedValue(makeUser({ customAiPrompt })),
        }),
        generateCompanyBriefingRateLimiter: makeRateLimiter(),
        companyBriefingRepository: makeCompanyBriefingRepository(),
        companyResearchSource: makeCompanyResearchSource(),
        ...makeCompanySearchDeps(),
        generateId: () => 'briefing-1',
        now: () => new Date('2026-08-21T00:00:00.000Z'),
      }).execute({ applicationId: 'app-1', userId: 'user-1' });

      const [messages, maxTokens, , options] = (llmProvider.complete as ReturnType<typeof vi.fn>)
        .mock.calls[0];
      expect({ messages, maxTokens, options }).toMatchSnapshot();
    },
  );
});
