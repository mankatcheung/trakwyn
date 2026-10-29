import type { ILLMProvider } from '#src/use-cases/ports/ILLMProvider.js';

export interface UsageTotals {
  promptTokens: number;
  completionTokens: number;
  latencyMs: number;
  calls: number;
}

const EMPTY_TOTALS: UsageTotals = { promptTokens: 0, completionTokens: 0, latencyMs: 0, calls: 0 };

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
    completeWithToolsStream: (messages, tools, maxTokens, signal) =>
      inner.completeWithToolsStream(messages, tools, maxTokens, signal),
  };

  return { provider, totals: () => totals };
}
