import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { buildProvider, targetLabel } from '#src/evals/buildProvider.js';
import { cacheKey } from '#src/evals/responseCache.js';
import { runSuite } from '#src/evals/runSuite.js';
import type { EvalCase, EvalTarget } from '#src/evals/types.js';
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
});
