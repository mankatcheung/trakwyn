import { describe, expect, it } from 'vitest';
import { parseEvalArgs } from '#src/evals/parseEvalArgs.js';

const parse = (argv: string[], env: Record<string, string> = {}) => parseEvalArgs(argv, env);

describe('parseEvalArgs', () => {
  it('reads one target from EVAL_PROVIDER, EVAL_MODEL and EVAL_API_KEY', () => {
    const config = parse([], {
      EVAL_PROVIDER: 'openai',
      EVAL_MODEL: 'gpt-x',
      EVAL_API_KEY: 'sk-1',
    });

    expect(config.targets).toEqual([
      { provider: 'openai', model: 'gpt-x', apiKey: 'sk-1', baseUrl: null },
    ]);
  });

  it('takes repeated --target flags and a per-provider key before the shared one', () => {
    const config = parse(['--target', 'openai:gpt-x', '--target', 'anthropic'], {
      EVAL_API_KEY: 'shared',
      EVAL_API_KEY_ANTHROPIC: 'sk-ant',
    });

    expect(config.targets).toEqual([
      { provider: 'openai', model: 'gpt-x', apiKey: 'shared', baseUrl: null },
      { provider: 'anthropic', model: null, apiKey: 'sk-ant', baseUrl: null },
    ]);
  });

  it('splits a target on the first colon only, so a slashed model name survives', () => {
    const config = parse(['--target', 'openrouter:anthropic/claude:beta'], { EVAL_API_KEY: 'k' });

    expect(config.targets[0]).toMatchObject({
      provider: 'openrouter',
      model: 'anthropic/claude:beta',
    });
  });

  it('collects --case ids and the cache switches', () => {
    const config = parse(['--case', 'a', '--case', 'b,c', '--cache', '--refresh'], {
      EVAL_PROVIDER: 'openai',
      EVAL_API_KEY: 'k',
    });

    expect(config.caseIds).toEqual(['a', 'b', 'c']);
    expect(config.cache).toBe(true);
    expect(config.refresh).toBe(true);
  });

  it('treats --refresh as turning the cache on, since it exists to rewrite it', () => {
    const config = parse(['--refresh'], { EVAL_PROVIDER: 'openai', EVAL_API_KEY: 'k' });

    expect(config.cache).toBe(true);
  });

  it('defaults the pass-rate floor and lets a flag or the env override it', () => {
    const base = { EVAL_PROVIDER: 'openai', EVAL_API_KEY: 'k' };

    expect(parse([], base).minPassRate).toBe(0.8);
    expect(parse([], { ...base, EVAL_MIN_PASS_RATE: '0.5' }).minPassRate).toBe(0.5);
    expect(parse(['--min-pass-rate', '0.9'], base).minPassRate).toBe(0.9);
  });

  it.each([[['--min-pass-rate', '1.5']], [['--min-pass-rate', 'abc']]])(
    'rejects a pass-rate floor outside 0-1: %j',
    (argv) => {
      expect(() => parse(argv, { EVAL_PROVIDER: 'openai', EVAL_API_KEY: 'k' })).toThrow(
        /min-pass-rate/,
      );
    },
  );

  it('says what is missing when no target is configured', () => {
    expect(() => parse([], {})).toThrow(/--target|EVAL_PROVIDER/);
  });

  it('rejects an unknown provider, naming the valid ones', () => {
    expect(() => parse(['--target', 'nope'], { EVAL_API_KEY: 'k' })).toThrow(/openai/);
  });

  it('rejects a target with no API key, naming the variables it looked for', () => {
    expect(() => parse(['--target', 'openai'], {})).toThrow(/EVAL_API_KEY_OPENAI/);
  });

  it('requires a model and base URL for the custom provider', () => {
    const env = { EVAL_API_KEY: 'k' };

    expect(() => parse(['--target', 'custom'], env)).toThrow(/model/);
    expect(() => parse(['--target', 'custom:m'], env)).toThrow(/EVAL_BASE_URL/);
    expect(
      parse(['--target', 'custom:m'], { ...env, EVAL_BASE_URL: 'https://x.test/v1' }).targets[0],
    ).toMatchObject({ baseUrl: 'https://x.test/v1' });
  });

  it('rejects flags it does not know instead of ignoring a typo', () => {
    expect(() => parse(['--targt', 'openai'], { EVAL_API_KEY: 'k' })).toThrow(/--targt/);
  });

  it('rejects a flag that is missing its value', () => {
    expect(() => parse(['--case'], { EVAL_PROVIDER: 'openai', EVAL_API_KEY: 'k' })).toThrow(
      /--case/,
    );
  });
});
