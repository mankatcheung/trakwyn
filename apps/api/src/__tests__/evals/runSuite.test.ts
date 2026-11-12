import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { buildProvider, targetLabel } from '#src/evals/buildProvider.js';
import { cacheKey } from '#src/evals/responseCache.js';
import { runSuite } from '#src/evals/runSuite.js';
import type { EvalCase, EvalTarget } from '#src/evals/types.js';
import { LlmProviderError } from '#src/use-cases/errors/DomainError.js';
import { makeLLMProvider } from '#src/__tests__/helpers/mocks/llm.js';

const stubCase = (id: string, failures: string[] = []): EvalCase => ({
  id,
  feature: 'jobDescription',
  idealReply: '{}',
  run: async () => failures,
});

describe('runSuite', () => {
  it('runs the cases in order and returns one result each', async () => {
    const order: string[] = [];
    const cases = ['a', 'b', 'c'].map((id): EvalCase => ({
      ...stubCase(id),
      run: async () => {
        order.push(id);
        return id === 'b' ? ['wrong'] : [];
      },
    }));

    const results = await runSuite(makeLLMProvider(), cases);

    expect(order).toEqual(['a', 'b', 'c']);
    expect(results.map((r) => [r.caseId, r.passed])).toEqual([
      ['a', true],
      ['b', false],
      ['c', true],
    ]);
  });

  it('reports each result as it lands, so a long run shows progress', async () => {
    const seen: string[] = [];

    await runSuite(makeLLMProvider(), [stubCase('a'), stubCase('b')], (result) =>
      seen.push(result.caseId),
    );

    expect(seen).toEqual(['a', 'b']);
  });

  it('keeps going after a case throws', async () => {
    const boom: EvalCase = {
      ...stubCase('boom'),
      run: async () => {
        throw new Error('503');
      },
    };

    const results = await runSuite(makeLLMProvider(), [boom, stubCase('after')]);

    expect(results.map((r) => r.passed)).toEqual([false, true]);
  });
});

describe('runSuite quota stop (JEF-556)', () => {
  const throwing = (id: string, detail: string | null): EvalCase => ({
    ...stubCase(id),
    run: async () => {
      throw new LlmProviderError('rate_limited', { provider: 'Workers AI', status: 429, detail });
    },
  });
  const quota =
    '{"errors":[{"code":4006,"message":"you have used up your daily free allocation"}]}';

  it('stops at the first quota error and leaves the rest unrun', async () => {
    const ran: string[] = [];
    const tracked = (id: string): EvalCase => ({
      ...stubCase(id),
      run: async () => {
        ran.push(id);
        return [];
      },
    });
    const second = throwing('b', quota);

    const results = await runSuite(makeLLMProvider(), [
      tracked('a'),
      second,
      tracked('c'),
      tracked('d'),
    ]);

    expect(results.map((r) => r.caseId)).toEqual(['a', 'b']);
    expect(results[1]?.quotaStop).toBe(true);
    expect(ran).toEqual(['a']);
  });

  it('keeps going after an ordinary 429, failing only that case', async () => {
    const results = await runSuite(makeLLMProvider(), [
      throwing('a', '{"error":"slow down"}'),
      stubCase('b'),
    ]);

    expect(results.map((r) => [r.caseId, r.passed])).toEqual([
      ['a', false],
      ['b', true],
    ]);
    expect(results.some((r) => r.quotaStop)).toBe(false);
  });
});

describe('buildProvider', () => {
  const target: EvalTarget = {
    provider: 'openai',
    model: 'gpt-x',
    apiKey: 'sk-test',
    baseUrl: null,
  };
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'eval-provider-'));
  });
  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
    vi.restoreAllMocks();
  });

  it('labels a target by provider and model, with a placeholder for the default model', () => {
    expect(targetLabel(target)).toBe('openai:gpt-x');
    expect(targetLabel({ ...target, model: null })).toBe('openai:default');
  });

  it('builds the real adapter for a known provider', () => {
    expect(typeof buildProvider(target, null).complete).toBe('function');
  });

  it('refuses a provider the registry does not know', () => {
    expect(() => buildProvider({ ...target, provider: 'nope' }, null)).toThrow(/nope/);
  });

  it('serves a stored reply without touching the network when caching is on', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    const messages = [{ role: 'user' as const, content: 'hi' }];
    const key = cacheKey(targetLabel(target), messages, undefined, undefined);
    const { writeFileSync } = await import('node:fs');
    writeFileSync(join(dir, `${key}.json`), JSON.stringify({ content: 'stored', usage: null }));

    const result = await buildProvider(target, { dir, refresh: false }).complete(messages);

    expect(result.content).toBe('stored');
    expect(fetchSpy).not.toHaveBeenCalled();
  });
  describe('workersai target (JEF-540)', () => {
    const workersAi = (model: string): EvalTarget => ({
      provider: 'workersai',
      model,
      apiKey: 'cf-tok',
      baseUrl: 'https://api.cloudflare.com/client/v4/accounts/acct-1/ai/v1/chat/completions',
    });
    const okReply = {
      ok: true,
      status: 200,
      json: () =>
        Promise.resolve({
          choices: [{ message: { content: 'hi' }, finish_reason: 'stop' }],
          usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
        }),
    } as unknown as Response;

    async function requestFor(
      model: string,
    ): Promise<{ headers: Record<string, string>; body: Record<string, unknown>; url: string }> {
      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(okReply);
      await buildProvider(workersAi(model), null).complete(
        [{ role: 'user', content: 'x' }],
        100,
        undefined,
        { reasoning: 'off' },
      );
      const [url, init] = fetchSpy.mock.calls[0]!;
      const request = init as RequestInit;
      return {
        url: String(url),
        headers: request.headers as Record<string, string>,
        body: JSON.parse(String(request.body)) as Record<string, unknown>,
      };
    }

    it('sends reasoning_effort=low to gpt-oss, as hosted AI does', async () => {
      const { body, url } = await requestFor('@cf/openai/gpt-oss-120b');

      expect(url).toContain('/accounts/acct-1/ai/v1/chat/completions');
      expect(body.reasoning_effort).toBe('low');
      expect(body).not.toHaveProperty('chat_template_kwargs');
    });

    it('sends chat_template_kwargs to Gemma, as hosted AI does', async () => {
      const { body } = await requestFor('@cf/google/gemma-4-26b-a4b-it');

      expect(body.chat_template_kwargs).toEqual({ enable_thinking: false });
      expect(body).not.toHaveProperty('reasoning_effort');
    });

    it('adds no gateway headers', async () => {
      const { headers } = await requestFor('@cf/openai/gpt-oss-120b');

      expect(Object.keys(headers).filter((name) => name.startsWith('cf-aig'))).toEqual([]);
      expect(headers.Authorization).toBe('Bearer cf-tok');
    });

    it('labels the target by provider and model for the cache', () => {
      expect(targetLabel(workersAi('@cf/openai/gpt-oss-120b'))).toBe(
        'workersai:@cf/openai/gpt-oss-120b',
      );
    });
  });
});
