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
import type { AiCreditCharge } from '#src/use-cases/ports/IAiCreditService.js';

/**
 * Gives a hosted AI charge back when the provider failed before the user got
 * anything (JEF-447). One resolve is one charge however many model calls the
 * turn makes, so the refund happens only if no call has produced output yet:
 * once any call has returned or streamed an event, the model did work and the
 * credits stay spent. A cancelled call is not a provider failure and is kept.
 */
export class CreditRefundingLLMProvider implements ILLMProvider {
  private delivered = false;

  constructor(
    private readonly inner: ILLMProvider,
    private readonly charge: AiCreditCharge,
  ) {}

  async complete(
    messages: LLMMessage[],
    maxTokens?: number,
    signal?: AbortSignal,
    options?: LLMCompleteOptions,
  ): Promise<LLMCompleteResult> {
    try {
      const result = await this.inner.complete(messages, maxTokens, signal, options);
      this.delivered = true;
      return result;
    } catch (err) {
      await this.refundIfFailed(err);
      throw err;
    }
  }

  async *completeWithToolsStream(
    messages: LLMMessage[],
    tools: LLMToolDefinition[],
    maxTokens?: number,
    signal?: AbortSignal,
    options?: LLMStreamOptions,
  ): AsyncGenerator<LLMStreamEvent> {
    try {
      for await (const event of this.inner.completeWithToolsStream(
        messages,
        tools,
        maxTokens,
        signal,
        options,
      )) {
        this.delivered = true;
        yield event;
      }
    } catch (err) {
      await this.refundIfFailed(err);
      throw err;
    }
  }

  private async refundIfFailed(err: unknown): Promise<void> {
    if (this.delivered || !(err instanceof LlmProviderError)) return;
    await this.charge.refund();
  }
}
