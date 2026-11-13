import { trace } from '@opentelemetry/api';
import { nanoid } from 'nanoid';

import {
  estimateCostMicros,
  resolveModelName,
} from '#src/infrastructure/llm/estimateCostMicros.js';
import type { AiFeature, AiModelTier } from '#src/use-cases/constants.js';
import { LlmProviderError } from '#src/use-cases/errors/DomainError.js';
import type { AiAnalyticsOutcome, IAiAnalytics } from '#src/use-cases/ports/IAiAnalytics.js';
import type {
  ILLMProvider,
  LLMAnsweredBy,
  LLMCompleteOptions,
  LLMCompleteResult,
  LLMMessage,
  LLMStreamEvent,
  LLMStreamOptions,
  LLMToolDefinition,
  LLMUsage,
} from '#src/use-cases/ports/ILLMProvider.js';
import { estimatePromptTokens } from '#src/use-cases/shared/tokenEstimate.js';

interface Deps {
  inner: ILLMProvider;
  analytics: IAiAnalytics;
  userId: string;
  provider: string;
  model: string | null;
  feature: AiFeature;
  source: string;
  tier?: AiModelTier;
  /** The version of the prompt the call sends (JEF-505); absent when it sends none. */
  promptVersion?: number;
  /** Monotonic clock in ms; injectable so tests can assert on exact durations. */
  now?: () => number;
}

interface Failure {
  outcome: AiAnalyticsOutcome;
  errorKind: string | null;
}

/**
 * Sends one PostHog `$ai_generation` event per tracked LLM call (JEF-567),
 * beside `TracingLLMProvider` and `UsageTrackingLLMProvider`. A call is
 * counted the way the tracing metrics count it, so PostHog's generation count
 * and `trakwyn.llm.calls` can be compared: success, provider error, and a
 * consumer that stopped early (`aborted`, not an error).
 *
 * Sits **inside** `TracingLLMProvider` so the active span while the inner
 * provider runs is the `llm.complete`/`llm.stream` span: its trace id is the
 * generation's `$ai_trace_id` and its span id the `$ai_span_id`. With no
 * active span (tracing off) a nanoid stands in for the trace id. The trace id
 * is handed back on `answeredBy.traceId` for a rating to store.
 *
 * Cost is `estimateCostMicros` from `LLM_PRICES`, the figure Axiom uses; an
 * unpriced model sends none. **No content is sent**: the event type has no
 * field for a prompt, reply, tool argument or error message, and an error is
 * reduced to `LlmProviderError.kind`.
 */
export class AiAnalyticsLLMProvider implements ILLMProvider {
  private readonly now: () => number;

  constructor(private readonly deps: Deps) {
    this.now = deps.now ?? (() => performance.now());
  }

  async complete(
    messages: LLMMessage[],
    maxTokens?: number,
    signal?: AbortSignal,
    options?: LLMCompleteOptions,
  ): Promise<LLMCompleteResult> {
    const call = this.startCall();
    try {
      const result = await this.deps.inner.complete(messages, maxTokens, signal, options);
      call.finish(result.usage, null);
      return { ...result, answeredBy: call.answeredBy(result.answeredBy) };
    } catch (error) {
      call.finish(null, classifyFailure(error, signal));
      throw error;
    }
  }

  async *completeWithToolsStream(
    messages: LLMMessage[],
    tools: LLMToolDefinition[],
    maxTokens?: number,
    signal?: AbortSignal,
    options?: LLMStreamOptions,
  ): AsyncGenerator<LLMStreamEvent> {
    const call = this.startCall();
    const stream = this.deps.inner.completeWithToolsStream(
      messages,
      tools,
      maxTokens,
      signal,
      options,
    );
    let promptTokens: number | null = null;
    let started = false;
    let completed = false;
    let failure: Failure | null = null;
    let usage: LLMUsage | null = null;

    try {
      for await (const event of stream) {
        started = true;
        if (event.type === 'prompt_usage') {
          promptTokens = event.promptTokens;
        } else {
          call.markFirstToken();
        }
        if (event.type === 'done') {
          completed = true;
          usage = event.usage;
          call.markProviderFinished();
          yield { ...event, answeredBy: call.answeredBy(event.answeredBy) };
          continue;
        }
        yield event;
      }
    } catch (error) {
      failure = classifyFailure(error, signal);
      throw error;
    } finally {
      if (!completed) {
        // What an interrupted reply already cost is its prompt, exact or estimated.
        if (promptTokens !== null) {
          usage = { promptTokens, completionTokens: 0 };
        } else if (started) {
          usage = { promptTokens: estimatePromptTokens(messages, tools), completionTokens: 0 };
        }
      }
      call.finish(usage, completed ? null : (failure ?? { outcome: 'aborted', errorKind: null }));
    }
  }

  private startCall(): AnalyticsCall {
    return new AnalyticsCall(this.deps, this.now);
  }
}

/** An abort the caller asked for is not a provider fault, whatever the provider threw. */
function classifyFailure(error: unknown, signal: AbortSignal | undefined): Failure {
  const aborted = signal?.aborted || (error instanceof Error && error.name === 'AbortError');
  return {
    outcome: aborted ? 'aborted' : 'error',
    errorKind: error instanceof LlmProviderError ? error.kind : null,
  };
}

/** The bookkeeping of one in-flight call: its ids, clock readings and the one event it sends. */
class AnalyticsCall {
  private readonly traceId: string;
  private readonly spanId: string | undefined;
  private readonly startedAt: number;
  private firstTokenAt: number | null = null;
  private providerFinishedAt: number | null = null;
  private sent = false;

  constructor(
    private readonly deps: Deps,
    private readonly now: () => number,
  ) {
    const active = trace.getActiveSpan()?.spanContext();
    const valid = active && trace.isSpanContextValid(active) ? active : undefined;
    this.traceId = valid?.traceId ?? nanoid();
    this.spanId = valid?.spanId;
    this.startedAt = now();
  }

  markFirstToken(): void {
    this.firstTokenAt ??= this.now();
  }

  markProviderFinished(): void {
    this.providerFinishedAt ??= this.now();
  }

  /** Adds the trace id to what the inner provider said; `UsageTrackingLLMProvider` fills the rest. */
  answeredBy(inner: LLMAnsweredBy | undefined): LLMAnsweredBy {
    const { provider, model, source } = this.deps;
    return {
      ...(inner ?? { provider, model: resolveModelName(provider, model), source }),
      traceId: this.traceId,
    };
  }

  finish(usage: LLMUsage | null, failure: Failure | null): void {
    if (this.sent) return;
    this.sent = true;
    const { analytics, userId, provider, model, feature, source, tier, promptVersion } = this.deps;
    const resolvedModel = resolveModelName(provider, model);
    // An unknown model still gets an event: the count has to match the call metric.
    const modelName = resolvedModel ?? 'unknown';
    const latencyMs = Math.round((this.providerFinishedAt ?? this.now()) - this.startedAt);
    try {
      analytics.generation({
        userId,
        traceId: this.traceId,
        feature,
        provider,
        model: modelName,
        source,
        promptVersion: promptVersion === undefined ? null : String(promptVersion),
        inputTokens: usage?.promptTokens ?? 0,
        outputTokens: usage?.completionTokens ?? 0,
        cacheReadTokens: usage?.cacheReadTokens ?? 0,
        cacheWriteTokens: usage?.cacheWriteTokens ?? 0,
        costMicros: usage ? estimateCostMicros(usage, provider, model) : null,
        latencyMs,
        outcome: failure?.outcome ?? 'ok',
        errorKind: failure?.errorKind ?? null,
        ...(tier ? { tier } : {}),
        ...(usage?.reasoningTokens === undefined ? {} : { reasoningTokens: usage.reasoningTokens }),
        ...(this.spanId ? { spanId: this.spanId } : {}),
        ...(this.firstTokenAt === null
          ? {}
          : { timeToFirstTokenMs: Math.round(this.firstTokenAt - this.startedAt) }),
      });
    } catch {
      // The port promises not to throw; analytics must never fail an AI action.
    }
  }
}
