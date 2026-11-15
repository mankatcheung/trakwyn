import { describe, expect, it, vi } from 'vitest';
import { parseReasoning, withReasoning } from '#src/evals/reasoningOverride.js';
import { parseEvalArgs } from '#src/evals/parseEvalArgs.js';
import { makeLLMProvider } from '#src/__tests__/helpers/mocks/llm.js';

describe('parseReasoning (JEF-599)', () => {
  it('is null when unset or blank, so each use case keeps its own setting', () => {
    expect(parseReasoning(undefined)).toBeNull();
    expect(parseReasoning('')).toBeNull();
    expect(parseReasoning('  ')).toBeNull();
  });

  it.each(['off', 'low', 'default'])('accepts %s, in any case', (level) => {
    expect(parseReasoning(level)).toBe(level);
    expect(parseReasoning(level.toUpperCase())).toBe(level);
  });

  it('refuses anything else, so a typo does not run the comparison on the default', () => {
    expect(() => parseReasoning('high')).toThrow(/EVAL_REASONING must be off, low or default/);
  });
});

describe('withReasoning', () => {
  it('forces the level on every complete call and keeps the caller’s other options', async () => {
    const provider = makeLLMProvider('{"ok":true}');
    const wrapped = withReasoning(provider, 'low');
    const signal = new AbortController().signal;

    await wrapped.complete([{ role: 'user', content: 'hi' }], 2048, signal, {
      json: true,
      reasoning: 'off',
    });

    expect(provider.complete).toHaveBeenCalledWith(
      [{ role: 'user', content: 'hi' }],
      2048,
      signal,
      { json: true, reasoning: 'low' },
    );
  });

  it('sets the level when the caller gave no options at all', async () => {
    const provider = makeLLMProvider('x');
    await withReasoning(provider, 'off').complete([], 100);

    expect(provider.complete).toHaveBeenCalledWith([], 100, undefined, { reasoning: 'off' });
  });

  it('returns what the provider returned, and leaves the provider’s other members alone', async () => {
    const provider = makeLLMProvider('answer');
    const other = vi.fn().mockReturnValue('streamed');
    (provider as unknown as Record<string, unknown>).somethingElse = other;
    const wrapped = withReasoning(provider, 'low') as unknown as Record<string, () => unknown>;

    expect((await withReasoning(provider, 'low').complete([], 1)).content).toBe('answer');
    expect(wrapped.somethingElse!()).toBe('streamed');
    expect(other).toHaveBeenCalledTimes(1);
  });
});

describe('EVAL_REASONING in the run config', () => {
  const parse = (env: Record<string, string>) =>
    parseEvalArgs([], { EVAL_PROVIDER: 'openai', EVAL_MODEL: 'm', EVAL_API_KEY: 'k', ...env });

  it('reads the level for the model under test', () => {
    expect(parse({ EVAL_REASONING: 'low' }).reasoning).toBe('low');
    expect(parse({}).reasoning).toBeNull();
  });

  it('stops a run with a bad level before any call is made', () => {
    expect(() => parse({ EVAL_REASONING: 'maximum' })).toThrow(/EVAL_REASONING/);
  });
});
