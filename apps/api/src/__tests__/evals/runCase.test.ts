import { describe, expect, it, vi } from 'vitest';
import { runCase } from '#src/evals/runCase.js';
import { AiResponseInvalidError } from '#src/use-cases/errors/DomainError.js';
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
      passed: true,
      schemaValid: true,
      failures: [],
      promptTokens: 12,
      completionTokens: 5,
    });
  });

  it('fails with the case’s own reasons', async () => {
    const result = await runCase(
      evalCase(async () => ['role was "X"']),
      makeLLMProvider(),
    );

    expect(result.passed).toBe(false);
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

    expect(result).toMatchObject({ passed: false, schemaValid: false });
    expect(result.failures[0]).toContain('not json');
  });

  it('records any other error as a failure and keeps the run going', async () => {
    const result = await runCase(
      evalCase(async () => {
        throw new Error('provider returned 429');
      }),
      makeLLMProvider(),
    );

    expect(result).toMatchObject({ passed: false, schemaValid: true });
    expect(result.failures[0]).toContain('provider returned 429');
  });
});
