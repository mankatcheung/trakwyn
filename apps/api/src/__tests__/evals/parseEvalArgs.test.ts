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

  it('defaults the error ceiling to 10% and lets a flag or the env override it (JEF-559)', () => {
    const base = { EVAL_PROVIDER: 'openai', EVAL_API_KEY: 'k' };

    expect(parse([], base).maxErrorRate).toBe(0.1);
    expect(parse([], { ...base, EVAL_MAX_ERROR_RATE: '0.25' }).maxErrorRate).toBe(0.25);
    expect(parse(['--max-error-rate', '0.05'], base).maxErrorRate).toBe(0.05);
    expect(
      parse(['--max-error-rate', '0'], { ...base, EVAL_MAX_ERROR_RATE: '0.5' }).maxErrorRate,
    ).toBe(0);
  });

  it.each([
    [['--max-error-rate', '2']],
    [['--max-error-rate', '-0.1']],
    [['--max-error-rate', 'abc']],
    [['--max-error-rate', ' ']],
  ])('rejects an error ceiling outside 0-1: %j', (argv) => {
    expect(() => parse(argv, { EVAL_PROVIDER: 'openai', EVAL_API_KEY: 'k' })).toThrow(
      /max-error-rate/,
    );
  });

  it('rejects a bad EVAL_MAX_ERROR_RATE too', () => {
    expect(() =>
      parse([], { EVAL_PROVIDER: 'openai', EVAL_API_KEY: 'k', EVAL_MAX_ERROR_RATE: 'lots' }),
    ).toThrow(/max-error-rate/);
  });

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
  describe('workersai (JEF-540)', () => {
    const cloudflare = {
      EVAL_CLOUDFLARE_ACCOUNT_ID: 'acct-1',
      EVAL_CLOUDFLARE_API_TOKEN: 'cf-tok',
    };

    it('builds the REST endpoint from the account id and takes the token as the key', () => {
      const config = parse(['--target', 'workersai:@cf/openai/gpt-oss-120b'], cloudflare);

      expect(config.targets).toEqual([
        {
          provider: 'workersai',
          model: '@cf/openai/gpt-oss-120b',
          apiKey: 'cf-tok',
          baseUrl: 'https://api.cloudflare.com/client/v4/accounts/acct-1/ai/v1/chat/completions',
        },
      ]);
    });

    it('needs no EVAL_API_KEY, and names the missing Cloudflare variable (not the production one)', () => {
      expect(() =>
        parse(['--target', 'workersai:m'], { EVAL_CLOUDFLARE_API_TOKEN: 'cf-tok' }),
      ).toThrow(/EVAL_CLOUDFLARE_ACCOUNT_ID/);
      expect(() =>
        parse(['--target', 'workersai:m'], { EVAL_CLOUDFLARE_ACCOUNT_ID: 'acct-1' }),
      ).toThrow(/EVAL_CLOUDFLARE_API_TOKEN/);
    });

    it('ignores the production PLATFORM_CLOUDFLARE_* variables', () => {
      expect(() =>
        parse(['--target', 'workersai:m'], {
          PLATFORM_CLOUDFLARE_ACCOUNT_ID: 'prod',
          PLATFORM_CLOUDFLARE_API_TOKEN: 'prod-tok',
        }),
      ).toThrow(/EVAL_CLOUDFLARE_ACCOUNT_ID/);
    });

    it('requires a model', () => {
      expect(() => parse(['--target', 'workersai'], cloudflare)).toThrow(/model/);
    });

    it('works as the judge, from its own EVAL_JUDGE_CLOUDFLARE_* variables', () => {
      const env = {
        ...cloudflare,
        EVAL_PROVIDER: 'openai',
        EVAL_API_KEY: 'k',
        EVAL_JUDGE_PROVIDER: 'workersai',
        EVAL_JUDGE_MODEL: '@cf/openai/gpt-oss-120b',
      };

      expect(() => parse([], env)).toThrow(/EVAL_JUDGE_CLOUDFLARE_ACCOUNT_ID/);
      expect(
        parse([], {
          ...env,
          EVAL_JUDGE_CLOUDFLARE_ACCOUNT_ID: 'acct-2',
          EVAL_JUDGE_CLOUDFLARE_API_TOKEN: 'judge-tok',
        }).judge,
      ).toMatchObject({
        provider: 'workersai',
        apiKey: 'judge-tok',
        baseUrl: expect.stringContaining('/accounts/acct-2/'),
      });
    });
  });
});

describe('parseEvalArgs --out', () => {
  const env = { EVAL_PROVIDER: 'openai', EVAL_API_KEY: 'k' };

  it('reads the report file, and has none by default', () => {
    expect(parseEvalArgs(['--out', 'reports/run.txt'], env).reportFile).toBe('reports/run.txt');
    expect(parseEvalArgs([], env).reportFile).toBeNull();
  });

  it('needs a value', () => {
    expect(() => parseEvalArgs(['--out'], env)).toThrow('--out needs a value');
    expect(() => parseEvalArgs(['--out', '--cache'], env)).toThrow('--out needs a value');
  });
});

describe('parseEvalArgs --publish (JEF-550)', () => {
  const env = { EVAL_PROVIDER: 'openai', EVAL_API_KEY: 'k' };
  const langfuse = {
    EVAL_LANGFUSE_PUBLIC_KEY: 'pk-lf-test',
    EVAL_LANGFUSE_SECRET_KEY: 'sk-lf-test',
  };

  it('publishes nowhere by default, and reads no Langfuse variable', () => {
    expect(parseEvalArgs([], env).publish).toBeNull();
    expect(parseEvalArgs([], { ...env, ...langfuse }).publish).toBeNull();
  });

  it('reads the keys and defaults the base URL to Langfuse Cloud (EU)', () => {
    expect(parseEvalArgs(['--publish'], { ...env, ...langfuse }).publish).toEqual({
      publicKey: 'pk-lf-test',
      secretKey: 'sk-lf-test',
      baseUrl: 'https://cloud.langfuse.com',
    });
  });

  it('takes the base URL from EVAL_LANGFUSE_BASE_URL', () => {
    const config = parseEvalArgs(['--publish'], {
      ...env,
      ...langfuse,
      EVAL_LANGFUSE_BASE_URL: 'https://us.cloud.langfuse.com',
    });

    expect(config.publish?.baseUrl).toBe('https://us.cloud.langfuse.com');
  });

  it.each(['EVAL_LANGFUSE_PUBLIC_KEY', 'EVAL_LANGFUSE_SECRET_KEY'])(
    'refuses --publish without %s, before any model call',
    (missing) => {
      const partial = { ...env, ...langfuse, [missing]: '  ' };

      expect(() => parseEvalArgs(['--publish'], partial)).toThrow(missing);
    },
  );

  it('does not let a target key stand in for the Langfuse keys', () => {
    expect(() => parseEvalArgs(['--publish'], env)).toThrow(/EVAL_LANGFUSE_PUBLIC_KEY/);
  });

  it('refuses a base URL that is not http(s)', () => {
    expect(() =>
      parseEvalArgs(['--publish'], { ...env, ...langfuse, EVAL_LANGFUSE_BASE_URL: 'ftp://x' }),
    ).toThrow('EVAL_LANGFUSE_BASE_URL');
  });

  it('does not publish a judge validation run (--validate-judge)', () => {
    const judgeEnv = {
      EVAL_JUDGE_PROVIDER: 'openai',
      EVAL_JUDGE_MODEL: 'm',
      EVAL_JUDGE_API_KEY: 'jk',
      ...langfuse,
    };

    expect(parseEvalArgs(['--validate-judge', '--publish'], judgeEnv).publish).toBeNull();
  });
});
