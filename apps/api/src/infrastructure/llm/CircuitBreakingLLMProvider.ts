import {
  CircuitBreakerOpenError,
  type CircuitAttempt,
  type CircuitBreaker,
  type FailureClass,
} from '#src/infrastructure/resilience/CircuitBreaker.js';
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

/**
 * The transport gave up: a timeout, an idle stream, or a connection that failed
 * or dropped. The providers let these through as they are (`fetch` throws a
 * `TimeoutError` or a `TypeError`), so they are not `LlmProviderError`s yet.
 */
function isTransportFailure(err: unknown): boolean {
  if (err instanceof DOMException) return err.name === 'TimeoutError' || err.name === 'AbortError';
  return err instanceof TypeError && /fetch failed|terminated/i.test(err.message);
}

/**
 * How a failed hosted call counts toward its model's circuit (JEF-504).
 *
 * Only a model that looks down counts: a 5xx, or a transport failure. A reply
 * the model gave on purpose (a 4xx, a 429, a bad token, no credit) shows it is
 * up, and a circuit would not fix it. A 429 is in that group because the error
 * does not carry `Retry-After`, so a busy model cannot be told from a sick one
 * and the second model (`FailoverLLMProvider`) already handles it. Anything
 * unrecognised is ignored rather than counted: a bug in our own code must not
 * take a healthy model out of rotation.
 */
export function classifyHostedFailure(err: unknown): FailureClass {
  if (err instanceof LlmProviderError) {
    return err.kind === 'unavailable' || err.kind === 'unreachable' ? 'failure' : 'success';
  }
  return isTransportFailure(err) ? 'failure' : 'ignore';
}

/**
 * Keeps one hosted model's health circuit (JEF-504) around its provider.
 *
 * While the circuit is open a call is refused before any request is made, with
 * the `unavailable` error `FailoverLLMProvider` and `OrderedFallbackLLMProvider`
 * already move on from. A transport failure is rethrown as `unreachable`, so the
 * callers above see a coded error instead of whatever `fetch` threw.
 *
 * A call the caller cancelled says nothing about the model, so it never counts.
 * A stream counts as a success only when it completes; one that fails after its
 * first event is still a failure, though the caller has already been handed
 * output and no other provider can take over.
 */
export class CircuitBreakingLLMProvider implements ILLMProvider {
  constructor(
    private readonly inner: ILLMProvider,
    private readonly breaker: CircuitBreaker,
    /** Names the provider in the refusal. */
    private readonly providerLabel: string,
    private readonly onShortCircuit?: () => void,
  ) {}

  async complete(
    messages: LLMMessage[],
    maxTokens?: number,
    signal?: AbortSignal,
    options?: LLMCompleteOptions,
  ): Promise<LLMCompleteResult> {
    const attempt = this.acquire();
    try {
      const result = await this.inner.complete(messages, maxTokens, signal, options);
      attempt.succeed();
      return result;
    } catch (err) {
      throw this.settleFailure(attempt, err, signal);
    }
  }

  async *completeWithToolsStream(
    messages: LLMMessage[],
    tools: LLMToolDefinition[],
    maxTokens?: number,
    signal?: AbortSignal,
    options?: LLMStreamOptions,
  ): AsyncGenerator<LLMStreamEvent> {
    const attempt = this.acquire();
    try {
      yield* this.inner.completeWithToolsStream(messages, tools, maxTokens, signal, options);
      attempt.succeed();
    } catch (err) {
      throw this.settleFailure(attempt, err, signal);
    } finally {
      // A consumer that stops early never reaches either branch above.
      attempt.release();
    }
  }

  private acquire(): CircuitAttempt {
    try {
      return this.breaker.acquire();
    } catch (err) {
      if (!(err instanceof CircuitBreakerOpenError)) throw err;
      this.onShortCircuit?.();
      throw new LlmProviderError('unavailable', { provider: this.providerLabel });
    }
  }

  /** Counts a failed call and returns the error to throw. */
  private settleFailure(attempt: CircuitAttempt, err: unknown, signal?: AbortSignal): unknown {
    if (signal?.aborted) {
      attempt.release();
      return err;
    }
    attempt.fail(err);
    return isTransportFailure(err)
      ? new LlmProviderError('unreachable', { provider: this.providerLabel })
      : err;
  }
}
