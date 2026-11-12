import { describe, expect, it, vi } from 'vitest';
import { runCase } from '#src/evals/runCase.js';
import { LEAKED_TOOL_CALL_DETAIL } from '#src/infrastructure/llm/leakedToolCall.js';
import { AiResponseInvalidError, LlmProviderError } from '#src/use-cases/errors/DomainError.js';
import { parseJobDescriptionPrompt } from '#src/use-cases/prompts/parseJobDescription.js';
import { resumeMatchPrompt } from '#src/use-cases/prompts/resumeMatch.js';
import type { EvalCase } from '#src/evals/types.js';
import { makeLLMProvider } from '#src/__tests__/helpers/mocks/llm.js';

const evalCase = (run: EvalCase['run']): EvalCase => ({
  id: 'c1',
  feature: 'jobDescription',
  idealReply: '{}',
  run,
});

describe('runCase', () => {
  it('passes when the case reports no failures, and records the usage it saw', async () => {
    const provider = makeLLMProvider('{}');
    vi.mocked(provider.complete).mockResolvedValue({
      content: '{}',
      usage: { promptTokens: 12, completionTokens: 5 },
    });

    const result = await runCase(
      evalCase(async (p) => {
        await p.complete([]);
        return [];
      }),
      provider,
    );

    expect(result).toMatchObject({
      caseId: 'c1',
      feature: 'jobDescription',
      outcome: 'pass',
      passed: true,
      schemaValid: true,
      failures: [],
      promptTokens: 12,
      completionTokens: 5,
    });
  });

  it('records the prompt and version the case ran against (JEF-505)', async () => {
    const job = await runCase(
      evalCase(async () => []),
      makeLLMProvider(),
    );
    const match = await runCase(
      { ...evalCase(async () => []), feature: 'resumeMatch' },
      makeLLMProvider(),
    );

    expect(job.prompt).toBe(`parseJobDescription@${parseJobDescriptionPrompt.version}`);
    expect(match.prompt).toBe(`resumeMatch@${resumeMatchPrompt.version}`);
  });

  it('fails with the case’s own reasons', async () => {
    const result = await runCase(
      evalCase(async () => ['role was "X"']),
      makeLLMProvider(),
    );

    expect(result).toMatchObject({ outcome: 'fail', passed: false });
    expect(result.schemaValid).toBe(true);
    expect(result.failures).toEqual(['role was "X"']);
  });

  it('marks an AI_RESPONSE_INVALID error as a schema failure', async () => {
    const result = await runCase(
      evalCase(async () => {
        throw new AiResponseInvalidError('not json');
      }),
      makeLLMProvider(),
    );

    expect(result).toMatchObject({ outcome: 'fail', passed: false, schemaValid: false });
    expect(result.failures[0]).toContain('not json');
  });

  it('records any other error as a failure and keeps the run going', async () => {
    const result = await runCase(
      evalCase(async () => {
        throw new Error('provider returned 429');
      }),
      makeLLMProvider(),
    );

    expect(result).toMatchObject({ outcome: 'error', passed: false, schemaValid: true });
    expect(result.failures[0]).toContain('provider returned 429');
  });
});

describe('runCase outcomes (JEF-559)', () => {
  const thrown = (error: Error) =>
    runCase(
      evalCase(async () => {
        throw error;
      }),
      makeLLMProvider(),
    );

  it('is an error when the provider answers 429', async () => {
    const result = await thrown(
      new LlmProviderError('rate_limited', { status: 429, detail: 'Token rate limit exceeded' }),
    );

    expect(result).toMatchObject({ outcome: 'error', passed: false });
    expect(result.quotaStop).toBeUndefined();
  });

  it.each(['bad_request', 'unreachable', 'auth', 'unavailable'] as const)(
    'is an error for a %s provider error',
    async (kind) => {
      expect((await thrown(new LlmProviderError(kind))).outcome).toBe('error');
    },
  );

  it('is a fail for a truncated or unreadable reply', async () => {
    const result = await thrown(new AiResponseInvalidError('reply was cut off'));

    expect(result.outcome).toBe('fail');
  });

  it.each([LEAKED_TOOL_CALL_DETAIL.MARKERS, LEAKED_TOOL_CALL_DETAIL.REASONING])(
    'is a fail, not an error, for a leaked tool call: %s',
    async (detail) => {
      const result = await thrown(new LlmProviderError('unavailable', { detail }));

      expect(result).toMatchObject({ outcome: 'fail', passed: false });
    },
  );

  it('is an error for an unavailable provider whose detail is something else', async () => {
    const result = await thrown(new LlmProviderError('unavailable', { detail: 'HTTP 503' }));

    expect(result.outcome).toBe('error');
  });

  it('is an error when the judge’s provider fails', async () => {
    const judge = makeLLMProvider('{}');
    vi.mocked(judge.complete).mockRejectedValue(
      new LlmProviderError('rate_limited', { status: 429 }),
    );

    const result = await runCase(
      evalCase(async (_provider, j) => {
        await j?.complete([]);
        return [];
      }),
      makeLLMProvider(),
      judge,
    );

    expect(result.outcome).toBe('error');
  });

  it('is an error for a quota stop, which also stops the target', async () => {
    const result = await thrown(
      new LlmProviderError('quota', { status: 429, provider: 'Workers AI' }),
    );

    expect(result).toMatchObject({ outcome: 'error', quotaStop: true });
  });
});

describe('runCase provider errors (JEF-542)', () => {
  const failing = (error: Error) =>
    runCase(
      evalCase(async () => {
        throw error;
      }),
      makeLLMProvider(),
    );

  it('adds the status and the response body to the failure', async () => {
    const result = await failing(
      new LlmProviderError('bad_request', {
        provider: 'Custom',
        status: 400,
        detail: '{"error":"content must be a string"}',
      }),
    );

    expect(result.failures[0]).toContain('check the model name in Settings');
    expect(result.failures[0]).toContain('[HTTP 400, body: {"error":"content must be a string"}]');
  });

  it('shows only what it has when the body or the status is missing', async () => {
    const noBody = await failing(new LlmProviderError('bad_request', { status: 404 }));
    const nothing = await failing(new LlmProviderError('unreachable'));

    expect(noBody.failures[0]).toContain('[HTTP 404]');
    expect(nothing.failures[0]).not.toContain('[');
  });

  it('leaves the error message itself alone', async () => {
    const error = new LlmProviderError('auth', { provider: 'Custom', status: 401, detail: 'nope' });

    await failing(error);

    expect(error.message).not.toContain('nope');
  });

  it('keeps the transcript of the model and judge calls (JEF-550)', async () => {
    const provider = makeLLMProvider('{}');
    const judge = makeLLMProvider('{}');
    vi.mocked(provider.complete).mockResolvedValue({ content: 'reply', usage: null });
    vi.mocked(judge.complete).mockResolvedValue({ content: 'verdict', usage: null });

    const result = await runCase(
      evalCase(async (p, j) => {
        await p.complete([{ role: 'user', content: 'in' }]);
        await j?.complete([{ role: 'user', content: 'check' }]);
        return [];
      }),
      provider,
      judge,
    );

    expect(result.calls).toMatchObject([{ messages: [{ content: 'in' }], output: 'reply' }]);
    expect(result.judgeCalls).toMatchObject([
      { messages: [{ content: 'check' }], output: 'verdict' },
    ]);
  });

  it('has empty transcripts when nothing was called', async () => {
    const result = await runCase(
      evalCase(async () => []),
      makeLLMProvider(),
    );

    expect(result.calls).toEqual([]);
    expect(result.judgeCalls).toEqual([]);
  });
});

describe('runCase quota stops (JEF-556)', () => {
  const failing = (error: Error) =>
    runCase(
      evalCase(async () => {
        throw error;
      }),
      makeLLMProvider(),
    );
  const cloudflare = (kind: 'rate_limited' | 'quota', detail: string | null) =>
    new LlmProviderError(kind, { provider: 'Workers AI', status: 429, detail });

  it('marks Cloudflare’s daily allocation (code 4006) as a quota stop', async () => {
    const result = await failing(
      cloudflare(
        'rate_limited',
        '{"errors":[{"code":4006,"message":"you have used up your daily free allocation of 10,000 neurons"}]}',
      ),
    );

    expect(result.quotaStop).toBe(true);
    expect(result.passed).toBe(false);
  });

  it('matches on the phrase alone, ignoring case', async () => {
    const result = await failing(cloudflare('rate_limited', 'Daily Free Allocation used'));

    expect(result.quotaStop).toBe(true);
  });

  it('marks a quota-kind error as a quota stop', async () => {
    expect((await failing(cloudflare('quota', null))).quotaStop).toBe(true);
  });

  it('leaves an ordinary 429 as a failure of its own case', async () => {
    const plain = await failing(cloudflare('rate_limited', '{"error":"slow down"}'));
    const noBody = await failing(cloudflare('rate_limited', null));

    expect(plain.quotaStop).toBeUndefined();
    expect(noBody.quotaStop).toBeUndefined();
  });

  it('does not treat other errors as a quota stop', async () => {
    expect((await failing(new Error('boom'))).quotaStop).toBeUndefined();
  });
});
