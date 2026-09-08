import type {
  ILLMProvider,
  LLMMessage,
  LLMToolDefinition,
  LLMStreamEvent,
  LLMCompleteOptions,
  LLMCompleteResult,
  LLMUsage,
} from '#src/use-cases/ports/ILLMProvider.js';
import type { ILlmUsageEventRepository } from '#src/use-cases/ports/ILlmUsageEventRepository.js';
import { estimatePromptTokens } from '#src/use-cases/shared/tokenEstimate.js';

interface Deps {
  inner: ILLMProvider;
  usageEventRepository: ILlmUsageEventRepository;
  generateId: () => string;
  userId: string;
  provider: string;
  model: string | null;
}

/**
 * Decorates an `ILLMProvider` so every completed call also writes a
 * `LlmUsageEvent` (JEF-250) — wired in by `UserLLMProviderFactory.forUser`
 * (the single choke point every real AI feature resolves its provider
 * through), never by `fromCredentials` (the "test before you save" /
 * "test a saved key" path has no usage worth counting).
 *
 * A response with no usage field (see `LLMUsage`'s doc comment) simply
 * records nothing rather than a fabricated zero. Recording itself fails
 * open: a broken usage log must never break the AI feature the user is
 * actually here for.
 *
 * A stream that ends without `done` — the client disconnected, the idle
 * timeout fired — is still charged for its prompt: exactly, when the
 * provider reported it up front (`prompt_usage`, Anthropic), or as an
 * estimate from the request flagged `estimated` when it did not (F3, the
 * OpenAI-compatible and Gemini paths). Without that, aborting a reply after
 * the first byte was a way past the monthly limit: the provider had billed
 * the whole prompt and the ledger saw nothing (S8). Zero output tokens in
 * both cases — what was streamed before the abort is not known here.
 */
export class UsageTrackingLLMProvider implements ILLMProvider {
  constructor(private readonly deps: Deps) {}

  async complete(
    messages: LLMMessage[],
    maxTokens?: number,
    signal?: AbortSignal,
    options?: LLMCompleteOptions,
  ): Promise<LLMCompleteResult> {
    const result = await this.deps.inner.complete(messages, maxTokens, signal, options);
    await this.record(result.usage);
    return result;
  }

  async *completeWithToolsStream(
    messages: LLMMessage[],
    tools: LLMToolDefinition[],
    maxTokens?: number,
    signal?: AbortSignal,
  ): AsyncGenerator<LLMStreamEvent> {
    let promptTokens: number | null = null;
    let recorded = false;
    // Only a stream that produced something was billed for its prompt; a
    // request refused outright (401, policy) never reached the model.
    let started = false;
    try {
      for await (const event of this.deps.inner.completeWithToolsStream(
        messages,
        tools,
        maxTokens,
        signal,
      )) {
        started = true;
        if (event.type === 'prompt_usage') promptTokens = event.promptTokens;
        if (event.type === 'done') {
          recorded = true;
          await this.record(event.usage);
        }
        yield event;
      }
    } finally {
      if (!recorded) {
        if (promptTokens !== null) {
          await this.record({ promptTokens, completionTokens: 0 });
        } else if (started) {
          await this.record(
            { promptTokens: estimatePromptTokens(messages, tools), completionTokens: 0 },
            { estimated: true },
          );
        }
      }
    }
  }

  private async record(
    usage: LLMUsage | null,
    { estimated = false }: { estimated?: boolean } = {},
  ): Promise<void> {
    if (!usage) return;
    try {
      await this.deps.usageEventRepository.record({
        id: this.deps.generateId(),
        userId: this.deps.userId,
        provider: this.deps.provider,
        model: this.deps.model,
        promptTokens: usage.promptTokens,
        completionTokens: usage.completionTokens,
        cacheReadTokens: usage.cacheReadTokens ?? null,
        cacheWriteTokens: usage.cacheWriteTokens ?? null,
        estimated,
      });
    } catch (err) {
      console.error('[llm-usage] failed to record usage event — continuing', err);
    }
  }
}
