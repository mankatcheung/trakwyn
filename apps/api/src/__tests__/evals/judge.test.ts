import { describe, expect, it } from 'vitest';
import {
  buildClaimCheckMessages,
  checkClaims,
  claimFailures,
  SUPPORT_RULE,
} from '#src/evals/judge/claimCheck.js';
import { LABELLED_OUTPUTS } from '#src/evals/judge/labelled.js';
import { requireJudge } from '#src/evals/judge/requireJudge.js';
import { formatValidation, validateJudge } from '#src/evals/judge/validateJudge.js';
import { ALL_CASES } from '#src/evals/cases/index.js';
import { JOB_DESCRIPTION_CASES } from '#src/evals/cases/jobDescription.js';
import { parseEvalArgs } from '#src/evals/parseEvalArgs.js';
import type { EvalConfig } from '#src/evals/types.js';
import type { ILLMProvider } from '#src/use-cases/ports/ILLMProvider.js';
import { makeLLMProvider } from '#src/__tests__/helpers/mocks/llm.js';

const reply = (claims: object[]) => JSON.stringify({ claims });

describe('checkClaims', () => {
  it('parses the claims, defaulting a missing evidence field to empty', async () => {
    const claims = await checkClaims(
      makeLLMProvider(reply([{ text: 'Went to MIT', supported: false }])),
      { source: 's', output: 'o' },
    );

    expect(claims).toEqual([{ text: 'Went to MIT', supported: false, evidence: '' }]);
  });

  it('accepts a reply wrapped in a code fence', async () => {
    const claims = await checkClaims(
      makeLLMProvider(
        `\`\`\`json\n${reply([{ text: 'a', supported: true, evidence: 'e' }])}\n\`\`\``,
      ),
      { source: 's', output: 'o' },
    );

    expect(claims).toHaveLength(1);
  });

  it.each(['not json', '{"claims":"none"}', '{"claims":[{"text":"a"}]}'])(
    'rejects the reply %s as invalid',
    async (bad) => {
      await expect(
        checkClaims(makeLLMProvider(bad), { source: 's', output: 'o' }),
      ).rejects.toMatchObject({ code: 'AI_RESPONSE_INVALID' });
    },
  );

  it('rejects a reply the provider cut off', async () => {
    const judge: ILLMProvider = {
      ...makeLLMProvider(),
      complete: async () => ({ content: '{"claims":[', usage: null, truncated: true }),
    };

    await expect(checkClaims(judge, { source: 's', output: 'o' })).rejects.toMatchObject({
      code: 'AI_RESPONSE_INVALID',
    });
  });

  it('fences the source and the output as data, and states the support rule', () => {
    const messages = buildClaimCheckMessages({ source: 'SRC', output: 'OUT' });

    expect(messages[0]?.content).toContain(SUPPORT_RULE);
    expect(messages[1]?.content.match(/<untrusted_external_content>/g)).toHaveLength(2);
  });
});

describe('claimFailures', () => {
  it('is empty when every claim is supported', () => {
    expect(claimFailures([{ text: 'a', supported: true, evidence: '' }])).toEqual([]);
  });

  it('names each unsupported claim and keeps the judge note', () => {
    const failures = claimFailures([
      { text: 'a', supported: true, evidence: '' },
      { text: 'Google', supported: false, evidence: 'not in profile' },
      { text: 'PhD', supported: false, evidence: '' },
    ]);

    expect(failures).toEqual([
      'unsupported claim: "Google" (judge noted: not in profile)',
      'unsupported claim: "PhD"',
    ]);
  });

  it('treats no claims as a failure', () => {
    expect(claimFailures([])).toHaveLength(1);
  });
});

/** A judge that answers from the labels, so the validation logic is tested without a model. */
function judgeFollowing(wrongIds: string[] = []): ILLMProvider {
  return {
    ...makeLLMProvider(),
    complete: async (messages) => {
      const output = messages.map((m) => m.content).join('\n');
      const item = LABELLED_OUTPUTS.find((candidate) => output.includes(candidate.output))!;
      const fabricated = (item.label === 'fabricated') !== wrongIds.includes(item.id);
      return {
        content: reply([{ text: 'a claim', supported: !fabricated, evidence: '' }]),
        usage: null,
      };
    },
  };
}

describe('the labelled set', () => {
  it('has faithful and fabricated outputs, each with a unique id', () => {
    const ids = LABELLED_OUTPUTS.map((item) => item.id);

    expect(new Set(ids).size).toBe(ids.length);
    expect(LABELLED_OUTPUTS.filter((item) => item.label === 'faithful').length).toBeGreaterThan(3);
    expect(LABELLED_OUTPUTS.filter((item) => item.label === 'fabricated').length).toBeGreaterThan(
      3,
    );
  });

  it('plants each fabrication in an output that differs from the faithful one', () => {
    const outputs = LABELLED_OUTPUTS.map((item) => item.output);

    expect(new Set(outputs).size).toBe(outputs.length);
  });
});

describe('validateJudge', () => {
  it('is fully accurate for a judge that sorts every output correctly', async () => {
    const validation = await validateJudge(judgeFollowing());

    expect(validation.accuracy).toBe(1);
    expect(validation.meetsThreshold).toBe(true);
  });

  it('is not trusted below the threshold and says which outputs it got wrong', async () => {
    const validation = await validateJudge(
      judgeFollowing(LABELLED_OUTPUTS.slice(0, 3).map((item) => item.id)),
    );

    expect(validation.meetsThreshold).toBe(false);
    expect(validation.verdicts.filter((v) => !v.correct)).toHaveLength(3);
    expect(formatValidation(validation, 0.9)).toContain('NOT trusted');
    expect(formatValidation(validation, 0.9)).toContain('WRONG');
  });

  it('counts a judge that finds nothing as wrong, even on a faithful output', async () => {
    const validation = await validateJudge(makeLLMProvider(reply([])));

    expect(validation.accuracy).toBe(0);
  });

  it('counts an unreadable reply as wrong instead of ending the run', async () => {
    const validation = await validateJudge(makeLLMProvider('nope'));

    expect(validation.meetsThreshold).toBe(false);
    expect(validation.verdicts.every((v) => v.error !== null)).toBe(true);
  });

  it('is not trusted with nothing to validate against', async () => {
    expect((await validateJudge(makeLLMProvider(), [])).meetsThreshold).toBe(false);
  });
});

describe('judge configuration', () => {
  const target = { EVAL_PROVIDER: 'openai', EVAL_API_KEY: 'sk-target' };
  const judge = {
    EVAL_JUDGE_PROVIDER: 'anthropic',
    EVAL_JUDGE_MODEL: 'claude-judge',
    EVAL_JUDGE_API_KEY: 'sk-judge',
  };

  it('reads the judge from EVAL_JUDGE_* alone', () => {
    expect(parseEvalArgs([], { ...target, ...judge }).judge).toEqual({
      provider: 'anthropic',
      model: 'claude-judge',
      apiKey: 'sk-judge',
      baseUrl: null,
    });
  });

  it('never falls back to the target or its key', () => {
    expect(parseEvalArgs([], target).judge).toBeNull();
    expect(() => parseEvalArgs([], { ...target, EVAL_JUDGE_PROVIDER: 'anthropic' })).toThrow(
      /EVAL_JUDGE_API_KEY/,
    );
  });

  it('--validate-judge needs a judge but no target', () => {
    expect(() => parseEvalArgs(['--validate-judge'], {})).toThrow(/needs a judge/);
    expect(parseEvalArgs(['--validate-judge'], judge)).toMatchObject({
      validateJudge: true,
      targets: [],
    });
  });

  it('a custom judge needs its own base URL', () => {
    expect(() =>
      parseEvalArgs([], {
        ...target,
        EVAL_BASE_URL: 'http://target',
        EVAL_JUDGE_PROVIDER: 'custom',
        EVAL_JUDGE_MODEL: 'm',
        EVAL_JUDGE_API_KEY: 'k',
      }),
    ).toThrow(/EVAL_JUDGE_BASE_URL/);
  });

  const config = (judgeTarget: EvalConfig['judge']): EvalConfig => ({
    targets: [],
    judge: judgeTarget,
    validateJudge: false,
    caseIds: [],
    cache: false,
    refresh: false,
    minPassRate: 0.8,
    maxErrorRate: 0.1,
    reportFile: null,
    publish: null,
    publishFrom: null,
    show: null,
    label: null,
    save: true,
  });

  it('refuses to start graded cases without a judge', () => {
    expect(() => requireJudge(config(null), ALL_CASES)).toThrow(/EVAL_JUDGE_PROVIDER/);
  });

  it('needs no judge when no selected case is graded', () => {
    expect(requireJudge(config(null), JOB_DESCRIPTION_CASES)).toBeNull();
  });

  it('returns the configured judge', () => {
    const configured = parseEvalArgs([], { ...target, ...judge }).judge;

    expect(requireJudge(config(configured), ALL_CASES)).toBe(configured);
  });
});
