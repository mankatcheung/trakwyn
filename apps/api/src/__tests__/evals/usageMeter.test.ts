import { describe, expect, it, vi } from 'vitest';
import { meterProvider } from '#src/evals/usageMeter.js';
import { makeLLMProvider } from '#src/__tests__/helpers/mocks/llm.js';

describe('meterProvider', () => {
  it('adds up the usage the provider reports across calls', async () => {
    const inner = makeLLMProvider('{}');
    vi.mocked(inner.complete)
      .mockResolvedValueOnce({ content: 'a', usage: { promptTokens: 10, completionTokens: 4 } })
      .mockResolvedValueOnce({ content: 'b', usage: { promptTokens: 5, completionTokens: 1 } });
    const meter = meterProvider(inner);

    await meter.provider.complete([{ role: 'user', content: 'x' }]);
    await meter.provider.complete([{ role: 'user', content: 'y' }]);

    expect(meter.totals()).toMatchObject({ promptTokens: 15, completionTokens: 5, calls: 2 });
  });

  it('counts a call that reports no usage as zero tokens, not as an error', async () => {
    const meter = meterProvider(makeLLMProvider('{}'));

    await meter.provider.complete([{ role: 'user', content: 'x' }]);

    expect(meter.totals()).toMatchObject({ promptTokens: 0, completionTokens: 0, calls: 1 });
  });

  it('times a call even when it throws, and rethrows', async () => {
    const inner = makeLLMProvider('{}');
    vi.mocked(inner.complete).mockRejectedValue(new Error('boom'));
    const meter = meterProvider(inner);

    await expect(meter.provider.complete([])).rejects.toThrow('boom');

    expect(meter.totals().calls).toBe(1);
    expect(meter.totals().latencyMs).toBeGreaterThanOrEqual(0);
  });

  it('passes messages, max tokens and options through untouched', async () => {
    const inner = makeLLMProvider('{}');
    const meter = meterProvider(inner);
    const messages = [{ role: 'user' as const, content: 'x' }];

    await meter.provider.complete(messages, 99, undefined, { json: true });

    expect(inner.complete).toHaveBeenCalledWith(messages, 99, undefined, { json: true });
  });
});
