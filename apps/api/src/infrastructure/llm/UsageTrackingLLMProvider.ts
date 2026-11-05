import type {
  ILLMProvider,
  LLMMessage,
  LLMToolDefinition,
  LLMStreamEvent,
  LLMCompleteOptions,
  LLMStreamOptions,
  LLMCompleteResult,
  LLMUsage,
} from '#src/use-cases/ports/ILLMProvider.js';
import type { ILlmUsageEventRepository } from '#src/use-cases/ports/ILlmUsageEventRepository.js';
import type { ILogger } from '#src/use-cases/ports/ILogger.js';
import {
  LLM_USAGE_SOURCE,
  type AiFeature,
  type AiModelTier,
  type LlmUsageSource,
} from '#src/use-cases/constants.js';
import type { IAiSpendGuard } from '#src/use-cases/ports/IAiSpendGuard.js';
import {
  estimateCostMicros,
  warnPriceUnknownOnce,
} from '#src/infrastructure/llm/estimateCostMicros.js';
import type { IMetrics } from '#src/infrastructure/observability/metrics.js';
import { estimatePromptTokens } from '#src/use-cases/shared/tokenEstimate.js';
import { costMismatch, neuronsToMicros } from '#src/infrastructure/llm/neuronCost.js';

interface Deps {
  inner: ILLMProvider;
  usageEventRepository: ILlmUsageEventRepository;
  generateId: () => string;
  logger: ILogger;
  userId: string;
  provider: string;
  model: string | null;
  feature: AiFeature;
  source: LlmUsageSource;
  /** The hosted model tier (JEF-448); absent on the user's own key. */
  tier?: AiModelTier;
  metrics: IMetrics;
  /** Optional (JEF-449): adds a platform call's cost to the day's spend. */
  aiSpendGuard?: IAiSpendGuard;
}

/**
 * Decorates an `ILLMProvider` so every completed call also writes a
 * `LlmUsageEvent` (JEF-250) — wired in by `UserLLMProviderFactory.forUser`
 * (the single choke point every real AI feature resolves its provider
 * through), never by `fromCredentials` (the "test before you save" /
 * "test a saved key" path has no usage worth counting).
 *
 * Each event also carries the call's `feature`, its `source` and its cost
 * (JEF-444); a model with no listed price records `null`, not a guess.
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
    options?: LLMStreamOptions,
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
        options,
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
          await this.record({ promptTokens, completionTokens: 0 }, { finished: false });
        } else if (started) {
          await this.record(
            { promptTokens: estimatePromptTokens(messages, tools), completionTokens: 0 },
            { estimated: true, finished: false },
          );
        }
      }
    }
  }

  private async record(
    usage: LLMUsage | null,
    { estimated = false, finished = true }: { estimated?: boolean; finished?: boolean } = {},
  ): Promise<void> {
    if (!usage) return;
    const { provider, model, feature, source, tier } = this.deps;
    const costMicros = estimateCostMicros(usage, provider, model);
    const isPlatform = source === LLM_USAGE_SOURCE.PLATFORM;
    if (isPlatform && finished) this.compareWithNeurons(usage, costMicros);
    if (costMicros === null) {
      warnPriceUnknownOnce(this.deps.logger, provider, model);
    } else {
      this.deps.metrics.recordLlmCost({ provider, model, feature, source, tier, costMicros });
      if (isPlatform) await this.deps.aiSpendGuard?.record(costMicros);
    }
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
        reasoningTokens: usage.reasoningTokens ?? null,
        neurons: usage.neurons ?? null,
        // Absent on a finished platform call means no thinking text was seen.
        // An aborted call never saw the whole response, so it says nothing.
        reasoningReturned: isPlatform && finished ? (usage.reasoningReturned ?? false) : null,
        estimated,
        costMicros,
        feature,
        source,
      });
    } catch (err) {
      this.deps.logger.error('[llm-usage] failed to record usage event — continuing', err);
    }
  }

  /**
   * Sets the neurons-based cost beside the price-table estimate (JEF-497) and
   * flags a gap, so a Cloudflare price change shows up in Axiom. Both numbers
   * are kept: neurons only check the estimate, they do not replace it.
   */
  private compareWithNeurons(usage: LLMUsage, costMicros: number | null): void {
    if (typeof usage.neurons !== 'number') return;
    const { model, feature } = this.deps;
    const neuronMicros = neuronsToMicros(usage.neurons);
    this.deps.metrics.recordLlmNeuronCost(model, feature, neuronMicros);
    if (costMicros === null) return;
    const direction = costMismatch(costMicros, neuronMicros);
    if (!direction) return;
    this.deps.metrics.recordLlmCostMismatch(model, direction);
    this.deps.logger.warn('llm.cost_mismatch', undefined, {
      model,
      direction,
      estimateMicros: costMicros,
      neuronMicros,
      neurons: usage.neurons,
    });
  }
}
