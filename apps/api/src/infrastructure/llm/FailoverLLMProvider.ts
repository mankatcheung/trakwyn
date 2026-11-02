import { LlmProviderError } from '#src/use-cases/errors/DomainError.js';
import type {
  ILLMProvider,
  LLMCompleteOptions,
  LLMCompleteResult,
  LLMMessage,
  LLMStreamEvent,
  LLMStreamOptions,
  LLMToolDefinition,
} from '#src/use-cases/ports/ILLMProvider.js';

/** Kinds worth a second provider: the first one is busy or down, not wrong. */
const FAILOVER_KINDS: ReadonlySet<string> = new Set(['rate_limited', 'unavailable']);

function shouldFailOver(err: unknown): boolean {
  return err instanceof LlmProviderError && FAILOVER_KINDS.has(err.kind);
}

/**
 * Retries once on a second provider (Hosted AI, JEF-446) when the first is
 * rate limited or unavailable. Never on a 4xx (the request itself is bad, so
 * the second provider would refuse it too), never after the caller has been
 * handed any streamed event, and never on a cancelled call.
 *
 * Each leg is expected to carry its own usage tracking, so the call that
 * answered is the one recorded, with its own provider and model.
 */
export class FailoverLLMProvider implements ILLMProvider {
  constructor(
    private readonly primary: ILLMProvider,
    private readonly fallback: ILLMProvider,
    private readonly onFailover?: (err: LlmProviderError) => void,
  ) {}

  async complete(
    messages: LLMMessage[],
    maxTokens?: number,
    signal?: AbortSignal,
    options?: LLMCompleteOptions,
  ): Promise<LLMCompleteResult> {
    try {
      return await this.primary.complete(messages, maxTokens, signal, options);
    } catch (err) {
      if (signal?.aborted || !shouldFailOver(err)) throw err;
      this.onFailover?.(err as LlmProviderError);
      return this.fallback.complete(messages, maxTokens, signal, options);
    }
  }

  async *completeWithToolsStream(
    messages: LLMMessage[],
    tools: LLMToolDefinition[],
    maxTokens?: number,
    signal?: AbortSignal,
    options?: LLMStreamOptions,
  ): AsyncGenerator<LLMStreamEvent> {
    let started = false;
    try {
      for await (const event of this.primary.completeWithToolsStream(
        messages,
        tools,
        maxTokens,
        signal,
        options,
      )) {
        started = true;
        yield event;
      }
      return;
    } catch (err) {
      if (started || signal?.aborted || !shouldFailOver(err)) throw err;
      this.onFailover?.(err as LlmProviderError);
    }
    yield* this.fallback.completeWithToolsStream(messages, tools, maxTokens, signal, options);
  }
}
