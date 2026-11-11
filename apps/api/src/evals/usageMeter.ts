import type { ILLMProvider, LLMMessage, LLMUsage } from '#src/use-cases/ports/ILLMProvider.js';
import type { RecordedCall } from '#src/evals/types.js';

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

const messageOf = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

/** Starts the clock for one call; the returned function turns what happened into a `RecordedCall`. */
function startCall(kind: RecordedCall['kind'], messages: LLMMessage[]) {
  const startedAt = Date.now();
  const clock = performance.now();
  return (outcome: {
    output: string | null;
    toolCalls?: RecordedCall['toolCalls'];
    usage?: LLMUsage | null;
    error?: string | null;
  }): RecordedCall => ({
    kind,
    messages,
    output: outcome.output,
    toolCalls: outcome.toolCalls ?? [],
    promptTokens: outcome.usage?.promptTokens ?? 0,
    completionTokens: outcome.usage?.completionTokens ?? 0,
    latencyMs: performance.now() - clock,
    startedAt,
    error: outcome.error ?? null,
  });
}

/**
 * Wraps a provider to total what its `complete` calls cost: the token counts
 * the provider reported (zero when it reported none) and the wall time,
 * including a call that threw. It also keeps each call's messages and reply
 * (`calls()`, JEF-550) so a run can be published and read afterwards.
 */
export function meterProvider(inner: ILLMProvider): {
  provider: ILLMProvider;
  totals(): UsageTotals;
  calls(): RecordedCall[];
} {
  let totals = EMPTY_TOTALS;
  let recorded: RecordedCall[] = [];

  const provider: ILLMProvider = {
    async complete(messages, maxTokens, signal, options) {
      const startedAt = performance.now();
      const finish = startCall('complete', messages);
      try {
        const result = await inner.complete(messages, maxTokens, signal, options);
        totals = {
          ...totals,
          promptTokens: totals.promptTokens + (result.usage?.promptTokens ?? 0),
          completionTokens: totals.completionTokens + (result.usage?.completionTokens ?? 0),
        };
        recorded = [...recorded, finish({ output: result.content, usage: result.usage })];
        return result;
      } catch (error: unknown) {
        recorded = [...recorded, finish({ output: null, error: messageOf(error) })];
        throw error;
      } finally {
        totals = {
          ...totals,
          latencyMs: totals.latencyMs + (performance.now() - startedAt),
          calls: totals.calls + 1,
        };
      }
    },
    // Not timed or token-counted in the totals (the chat eval reports iterations,
    // not cost); it counts the requests and the tool calls so the report can show
    // them, and records each iteration for the transcript.
    async *completeWithToolsStream(messages, tools, maxTokens, signal, streamOptions) {
      totals = { ...totals, streams: totals.streams + 1 };
      const finish = startCall('stream', messages);
      let finished = false;
      try {
        for await (const event of inner.completeWithToolsStream(
          messages,
          tools,
          maxTokens,
          signal,
          streamOptions,
        )) {
          if (event.type === 'done') {
            totals = { ...totals, toolCalls: totals.toolCalls + event.toolCalls.length };
            recorded = [
              ...recorded,
              finish({ output: event.content, toolCalls: event.toolCalls, usage: event.usage }),
            ];
            finished = true;
          }
          yield event;
        }
      } catch (error: unknown) {
        if (!finished) {
          recorded = [...recorded, finish({ output: null, error: messageOf(error) })];
        }
        throw error;
      }
    },
  };

  return { provider, totals: () => totals, calls: () => recorded };
}
