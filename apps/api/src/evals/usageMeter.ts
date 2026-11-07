import type { ILLMProvider } from '#src/use-cases/ports/ILLMProvider.js';

export interface UsageTotals {
  promptTokens: number;
  completionTokens: number;
  latencyMs: number;
  calls: number;
  /** Tool-calling requests made (chat loop iterations) and the tool calls the model asked for. */
  streams: number;
  toolCalls: number;
}

const EMPTY_TOTALS: UsageTotals = {
  promptTokens: 0,
  completionTokens: 0,
  latencyMs: 0,
  calls: 0,
  streams: 0,
  toolCalls: 0,
};

/**
 * Wraps a provider to total what its `complete` calls cost: the token counts
 * the provider reported (zero when it reported none) and the wall time,
 * including a call that threw.
 */
export function meterProvider(inner: ILLMProvider): {
  provider: ILLMProvider;
  totals(): UsageTotals;
} {
  let totals = EMPTY_TOTALS;

  const provider: ILLMProvider = {
    async complete(messages, maxTokens, signal, options) {
      const startedAt = performance.now();
      try {
        const result = await inner.complete(messages, maxTokens, signal, options);
        totals = {
          ...totals,
          promptTokens: totals.promptTokens + (result.usage?.promptTokens ?? 0),
          completionTokens: totals.completionTokens + (result.usage?.completionTokens ?? 0),
        };
        return result;
      } finally {
        totals = {
          ...totals,
          latencyMs: totals.latencyMs + (performance.now() - startedAt),
          calls: totals.calls + 1,
        };
      }
    },
    // Not timed or token-counted (the chat eval reports iterations, not cost); it
    // only counts the requests and the tool calls so the report can show them.
    async *completeWithToolsStream(messages, tools, maxTokens, signal, streamOptions) {
      totals = { ...totals, streams: totals.streams + 1 };
      for await (const event of inner.completeWithToolsStream(
        messages,
        tools,
        maxTokens,
        signal,
        streamOptions,
      )) {
        if (event.type === 'done') {
          totals = { ...totals, toolCalls: totals.toolCalls + event.toolCalls.length };
        }
        yield event;
      }
    },
  };

  return { provider, totals: () => totals };
}
