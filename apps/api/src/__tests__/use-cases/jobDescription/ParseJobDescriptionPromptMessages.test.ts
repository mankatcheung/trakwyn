import { describe, it, expect, vi } from 'vitest';
import { ParseJobDescriptionUseCase } from '#src/use-cases/jobDescription/ParseJobDescriptionUseCase.js';
import { makeRateLimiter } from '#src/__tests__/helpers/mocks/infrastructure.js';
import { makeLLMProvider, makeLLMProviderFactory } from '#src/__tests__/helpers/mocks/llm.js';
import type { StructuredJobPosting } from '#src/use-cases/ports/IJobPostingSourceResolver.js';
import type { IParsedPostingCache } from '#src/use-cases/ports/IParsedPostingCache.js';

/** The exact messages the job posting parser sends (JEF-505). */
describe('ParseJobDescriptionUseCase prompt messages', () => {
  const sentCall = async (structured: StructuredJobPosting | null) => {
    const llmProvider = makeLLMProvider(JSON.stringify({ company: 'Acme', role: 'Engineer' }));
    const text = 'We are Acme Corp looking for a Senior Engineer';
    await new ParseJobDescriptionUseCase({
      llmProviderFactory: makeLLMProviderFactory({
        forUser: vi.fn().mockResolvedValue(llmProvider),
      }),
      jobPostingSourceResolver: {
        resolve: vi.fn().mockResolvedValue(text),
        resolveDetailed: vi.fn().mockResolvedValue({ text, fetchedFromUrl: false, structured }),
      },
      parsedPostingCache: {
        getOrParse: vi.fn(async (_text: string, parse: () => Promise<unknown>) => ({
          value: await parse(),
          cached: false,
        })) as IParsedPostingCache['getOrParse'],
      },
      parseJobDescriptionRateLimiter: makeRateLimiter(),
    }).execute({ userId: 'user-1', text });
    const [messages, maxTokens, , options] = (llmProvider.complete as ReturnType<typeof vi.fn>).mock
      .calls[0];
    return { messages, maxTokens, options };
  };

  it('pasted text with no structured hints', async () => {
    expect(await sentCall(null)).toMatchSnapshot();
  });

  it('with hints from the page JSON-LD', async () => {
    expect(
      await sentCall({
        company: 'Acme Corp',
        role: null,
        location: 'Remote',
        salary: null,
        description: 'short',
      }),
    ).toMatchSnapshot();
  });
});
