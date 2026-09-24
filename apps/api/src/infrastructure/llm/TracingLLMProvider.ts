import {
  context,
  trace,
  SpanKind,
  SpanStatusCode,
  type Context,
  type Span,
} from '@opentelemetry/api';

import { AXIOM, TRACING } from '#src/infrastructure/config/constants.js';
import type {
  IMetrics,
  LlmCallOutcome,
  LlmOperation,
} from '#src/infrastructure/observability/metrics.js';
import { LlmProviderError } from '#src/use-cases/errors/DomainError.js';
import type {
  ILLMProvider,
  LLMCompleteOptions,
  LLMCompleteResult,
  LLMMessage,
  LLMStreamEvent,
  LLMToolDefinition,
  LLMUsage,
} from '#src/use-cases/ports/ILLMProvider.js';
import { estimatePromptTokens } from '#src/use-cases/shared/tokenEstimate.js';

/**
 * Span names and attribute keys (JEF-113). The `gen_ai.*` keys are the OTel
 * GenAI semantic conventions; they are spelled out here rather than imported
 * from `@opentelemetry/semantic-conventions/incubating`, whose exports are
 * unstable by design. `gen_ai.provider.name` is the current name for what
 * older versions called `gen_ai.system`. Kept beside the decorator, as
 * `METRICS` is beside the counters: this module is their only writer.
 */
export const LLM_SPAN = {
  COMPLETE: 'llm.complete',
  STREAM: 'llm.stream',
  OPERATION_NAME: 'gen_ai.operation.name',
  PROVIDER: 'gen_ai.provider.name',
  MODEL: 'gen_ai.request.model',
  INPUT_TOKENS: 'gen_ai.usage.input_tokens',
  OUTPUT_TOKENS: 'gen_ai.usage.output_tokens',
  CACHE_READ_TOKENS: 'app.llm.cache_read_tokens',
  CACHE_WRITE_TOKENS: 'app.llm.cache_write_tokens',
  ESTIMATED: 'app.llm.estimated',
  TIME_TO_FIRST_TOKEN_MS: 'app.llm.time_to_first_token_ms',
  OUTCOME: 'app.llm.outcome',
  ERROR_KIND: 'app.llm.error_kind',
  ERROR_TYPE: 'error.type',
  HTTP_STATUS: 'http.response.status_code',
} as const;

/** Both methods hold a conversation with a chat model; GenAI's name for that operation. */
const GEN_AI_OPERATION = 'chat';

interface Deps {
  inner: ILLMProvider;
  metrics: IMetrics;
  provider: string;
  model: string | null;
  /** Monotonic clock in ms; injectable so tests can assert on exact durations. */
  now?: () => number;
}

interface Failure {
  outcome: LlmCallOutcome;
  error: unknown;
}

/**
 * Decorates an `ILLMProvider` with one span and a set of `trakwyn.llm.*`
 * metrics per call (JEF-113), so a slow model, a provider outage or a run of
 * refused keys can be charted and alerted on in Axiom. Before this, an LLM
 * call was visible only as a bare `undici` span.
 *
 * Wired in by `UserLLMProviderFactory` beneath `UsageTrackingLLMProvider`, so
 * the span times the provider and not the ledger insert, and only when
 * `isObservabilityEnabled` — dev and test never build it. Like the usage
 * tracker it is applied to real traffic only, never to a key test.
 *
 * **No content is recorded, ever**: no prompt, message, tool result or
 * completion text, on the span or on a metric. The span says who was asked
 * (provider, model), what it cost (tokens) and how it went (latency, outcome,
 * error kind). An exception is only recorded when it is an `LlmProviderError`,
 * whose message is written for users; any other error's message could quote
 * the provider's response, so it contributes its class name alone.
 *
 * Token counts come from the same `LLMUsage` the usage tracker reads (the
 * `complete()` result, a stream's `prompt_usage` and `done`), so provider
 * responses are not parsed twice.
 */
export class TracingLLMProvider implements ILLMProvider {
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
    const call = this.startCall('complete');
    try {
      const result = await context.with(call.context, () =>
        this.deps.inner.complete(messages, maxTokens, signal, options),
      );
      call.setUsage(result.usage, false);
      call.finish(null);
      return result;
    } catch (error) {
      call.finish(classifyFailure(error, signal));
      throw error;
    }
  }

  /**
   * The span stays open and active for the whole iteration, as
   * `traceUseCase` does for the chat use case, so work that runs while the
   * consumer holds the stream nests under it. The latency metric, though,
   * stops at `done`: that is when the provider finished, and what the
   * consumer does afterwards is not the provider's time.
   */
  async *completeWithToolsStream(
    messages: LLMMessage[],
    tools: LLMToolDefinition[],
    maxTokens?: number,
    signal?: AbortSignal,
  ): AsyncGenerator<LLMStreamEvent> {
    const call = this.startCall('stream');
    const stream = context.with(call.context, () =>
      this.deps.inner.completeWithToolsStream(messages, tools, maxTokens, signal),
    );
    let promptTokens: number | null = null;
    let started = false;
    let completed = false;
    let failure: Failure | null = null;

    try {
      let step = await context.with(call.context, () => stream.next());
      while (!step.done) {
        const event = step.value;
        started = true;
        if (event.type === 'prompt_usage') {
          promptTokens = event.promptTokens;
        } else {
          call.markFirstToken();
        }
        if (event.type === 'done') {
          completed = true;
          call.setUsage(event.usage, false);
          call.markProviderFinished();
        }
        yield event;
        step = await context.with(call.context, () => stream.next());
      }
    } catch (error) {
      failure = classifyFailure(error, signal);
      throw error;
    } finally {
      // A consumer that breaks out of its `for await` ends this generator
      // here; the provider's own stream has to be closed too.
      await context.with(call.context, () => stream.return(undefined));
      if (!completed) {
        // Same fallback as the usage ledger: what the provider already billed
        // for an interrupted reply is its prompt, exact or estimated.
        if (promptTokens !== null) {
          call.setUsage({ promptTokens, completionTokens: 0 }, false);
        } else if (started) {
          call.setUsage(
            { promptTokens: estimatePromptTokens(messages, tools), completionTokens: 0 },
            true,
          );
        }
      }
      call.finish(completed ? null : (failure ?? { outcome: 'aborted', error: null }));
    }
  }

  private startCall(operation: LlmOperation): LlmCall {
    const span = trace
      .getTracer(AXIOM.SERVICE_NAME)
      .startSpan(operation === 'complete' ? LLM_SPAN.COMPLETE : LLM_SPAN.STREAM, {
        kind: SpanKind.CLIENT,
        attributes: {
          [LLM_SPAN.OPERATION_NAME]: GEN_AI_OPERATION,
          [LLM_SPAN.PROVIDER]: this.deps.provider,
          ...(this.deps.model ? { [LLM_SPAN.MODEL]: this.deps.model } : {}),
        },
      });
    return new LlmCall(span, operation, this.deps, this.now);
  }
}

/**
 * An abort the caller asked for (client gone, timeout) is not a provider
 * fault, whatever the provider threw on the way out.
 */
function classifyFailure(error: unknown, signal: AbortSignal | undefined): Failure {
  const aborted = signal?.aborted || (error instanceof Error && error.name === 'AbortError');
  return { outcome: aborted ? 'aborted' : 'error', error };
}

/** The mutable bookkeeping of one in-flight call: its span, clock readings and usage. */
class LlmCall {
  readonly context: Context;
  private readonly startedAt: number;
  private firstTokenAt: number | null = null;
  private providerFinishedAt: number | null = null;
  private usage: LLMUsage | null = null;

  constructor(
    private readonly span: Span,
    private readonly operation: LlmOperation,
    private readonly deps: Pick<Deps, 'metrics' | 'provider' | 'model'>,
    private readonly now: () => number,
  ) {
    this.context = trace.setSpan(context.active(), span);
    this.startedAt = now();
  }

  markFirstToken(): void {
    this.firstTokenAt ??= this.now();
  }

  markProviderFinished(): void {
    this.providerFinishedAt ??= this.now();
  }

  setUsage(usage: LLMUsage | null, estimated: boolean): void {
    if (!usage) return;
    this.usage = usage;
    this.span.setAttributes({
      [LLM_SPAN.INPUT_TOKENS]: usage.promptTokens,
      [LLM_SPAN.OUTPUT_TOKENS]: usage.completionTokens,
      [LLM_SPAN.ESTIMATED]: estimated,
      ...(usage.cacheReadTokens !== undefined
        ? { [LLM_SPAN.CACHE_READ_TOKENS]: usage.cacheReadTokens }
        : {}),
      ...(usage.cacheWriteTokens !== undefined
        ? { [LLM_SPAN.CACHE_WRITE_TOKENS]: usage.cacheWriteTokens }
        : {}),
    });
  }

  /** Ends the span and records the metrics. `failure` is null for a call that completed. */
  finish(failure: Failure | null): void {
    const outcome: LlmCallOutcome = failure?.outcome ?? 'success';
    const errorKind = failure?.error instanceof LlmProviderError ? failure.error.kind : null;
    const durationMs = (this.providerFinishedAt ?? this.now()) - this.startedAt;

    this.span.setAttribute(LLM_SPAN.OUTCOME, outcome);
    if (this.operation === 'stream' && this.firstTokenAt !== null) {
      this.span.setAttribute(
        LLM_SPAN.TIME_TO_FIRST_TOKEN_MS,
        Math.round(this.firstTokenAt - this.startedAt),
      );
    }
    if (failure?.outcome === 'error') this.failSpan(failure.error);
    this.span.end();

    const { metrics, provider, model } = this.deps;
    metrics.recordLlmCall({
      provider,
      model,
      operation: this.operation,
      outcome,
      errorKind,
      durationMs,
    });
    this.recordTokens();
  }

  private failSpan(error: unknown): void {
    this.span.setAttribute(LLM_SPAN.ERROR_TYPE, errorType(error));
    if (!(error instanceof LlmProviderError)) {
      this.span.setStatus({ code: SpanStatusCode.ERROR });
      return;
    }
    this.span.recordException(error);
    this.span.setStatus({ code: SpanStatusCode.ERROR, message: error.message });
    this.span.setAttributes({
      [LLM_SPAN.ERROR_KIND]: error.kind,
      [TRACING.ERROR_CODE_ATTRIBUTE]: error.code,
      ...(error.status !== null ? { [LLM_SPAN.HTTP_STATUS]: error.status } : {}),
    });
  }

  private recordTokens(): void {
    if (!this.usage) return;
    const { metrics, provider } = this.deps;
    const { promptTokens, completionTokens, cacheReadTokens, cacheWriteTokens } = this.usage;
    metrics.recordLlmTokens(provider, 'input', promptTokens);
    metrics.recordLlmTokens(provider, 'output', completionTokens);
    if (cacheReadTokens !== undefined)
      metrics.recordLlmTokens(provider, 'cache_read', cacheReadTokens);
    if (cacheWriteTokens !== undefined) {
      metrics.recordLlmTokens(provider, 'cache_write', cacheWriteTokens);
    }
  }
}

function errorType(error: unknown): string {
  if (error instanceof Error) return error.constructor.name || error.name;
  return typeof error;
}
