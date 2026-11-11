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

  describe('transcript (JEF-550)', () => {
    it('records the messages, reply, usage and timing of each complete call', async () => {
      const inner = makeLLMProvider('{}');
      vi.mocked(inner.complete).mockResolvedValue({
        content: 'hello',
        usage: { promptTokens: 7, completionTokens: 2 },
      });
      const meter = meterProvider(inner);
      const messages = [{ role: 'user' as const, content: 'hi' }];

      await meter.provider.complete(messages, 50, undefined, { json: true });

      const [call] = meter.calls();
      expect(meter.calls()).toHaveLength(1);
      expect(call).toMatchObject({
        kind: 'complete',
        messages,
        output: 'hello',
        toolCalls: [],
        promptTokens: 7,
        completionTokens: 2,
        error: null,
      });
      expect(call?.latencyMs).toBeGreaterThanOrEqual(0);
      expect(call?.startedAt).toBeGreaterThan(0);
    });

    it('records a call that throws, with the error message', async () => {
      const inner = makeLLMProvider('{}');
      vi.mocked(inner.complete).mockRejectedValue(new Error('boom'));
      const meter = meterProvider(inner);

      await expect(meter.provider.complete([{ role: 'user', content: 'x' }])).rejects.toThrow(
        'boom',
      );

      expect(meter.calls()).toMatchObject([{ kind: 'complete', output: null, error: 'boom' }]);
    });

    it('records each stream iteration as one call with the tool calls it asked for', async () => {
      const inner = makeLLMProvider('{}');
      const toolCalls = [{ id: 't1', name: 'list_applications', arguments: {} }];
      vi.mocked(inner.completeWithToolsStream).mockImplementation(async function* () {
        yield { type: 'text_delta', text: 'partial' };
        yield {
          type: 'done',
          content: null,
          toolCalls,
          usage: { promptTokens: 30, completionTokens: 4 },
        };
      });
      const meter = meterProvider(inner);
      const messages = [{ role: 'user' as const, content: 'list' }];

      for await (const event of meter.provider.completeWithToolsStream(messages, [])) {
        void event;
      }

      expect(meter.calls()).toMatchObject([
        {
          kind: 'stream',
          messages,
          output: null,
          toolCalls,
          promptTokens: 30,
          completionTokens: 4,
        },
      ]);
    });

    it('does not change the totals the report already uses', async () => {
      const inner = makeLLMProvider('{}');
      const meter = meterProvider(inner);

      await meter.provider.complete([{ role: 'user', content: 'x' }]);

      expect(meter.totals()).toMatchObject({ calls: 1, streams: 0, toolCalls: 0 });
    });
  });
});
