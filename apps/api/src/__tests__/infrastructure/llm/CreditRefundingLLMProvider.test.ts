import { describe, expect, it, vi } from 'vitest';
import { CreditRefundingLLMProvider } from '#src/infrastructure/llm/CreditRefundingLLMProvider.js';
import { LlmProviderError } from '#src/use-cases/errors/DomainError.js';
import type { ILLMProvider, LLMStreamEvent } from '#src/use-cases/ports/ILLMProvider.js';

const failure = () => new LlmProviderError('unavailable', { status: 503 });

async function* events(...list: (LLMStreamEvent | Error)[]): AsyncGenerator<LLMStreamEvent> {
  for (const item of list) {
    if (item instanceof Error) throw item;
    yield item;
  }
}

const delta = { type: 'text', text: 'hi' } as unknown as LLMStreamEvent;

function build(inner: Partial<ILLMProvider>) {
  const charge = { refund: vi.fn().mockResolvedValue(undefined) };
  const provider = new CreditRefundingLLMProvider(inner as ILLMProvider, charge);
  return { provider, charge };
}

const drain = async (gen: AsyncGenerator<LLMStreamEvent>) => {
  for await (const event of gen) void event;
};

describe('CreditRefundingLLMProvider', () => {
  it('keeps the credits for a call that succeeds', async () => {
    const { provider, charge } = build({ complete: vi.fn().mockResolvedValue({ content: 'ok' }) });

    await provider.complete([]);

    expect(charge.refund).not.toHaveBeenCalled();
  });

  it('refunds a complete() that fails with a provider error', async () => {
    const { provider, charge } = build({ complete: vi.fn().mockRejectedValue(failure()) });

    await expect(provider.complete([])).rejects.toBeInstanceOf(LlmProviderError);

    expect(charge.refund).toHaveBeenCalledTimes(1);
  });

  it('refunds a stream that fails before any event', async () => {
    const { provider, charge } = build({
      completeWithToolsStream: () => events(failure()),
    });

    await expect(drain(provider.completeWithToolsStream([], []))).rejects.toBeInstanceOf(
      LlmProviderError,
    );

    expect(charge.refund).toHaveBeenCalledTimes(1);
  });

  it('keeps the credits for a stream that fails after output started', async () => {
    const { provider, charge } = build({
      completeWithToolsStream: () => events(delta, failure()),
    });

    await expect(drain(provider.completeWithToolsStream([], []))).rejects.toBeInstanceOf(
      LlmProviderError,
    );

    expect(charge.refund).not.toHaveBeenCalled();
  });

  it('keeps the credits when a later call of the same turn fails after an earlier one answered', async () => {
    const stream = vi
      .fn()
      .mockReturnValueOnce(events(delta))
      .mockReturnValueOnce(events(failure()));
    const { provider, charge } = build({ completeWithToolsStream: stream });

    await drain(provider.completeWithToolsStream([], []));
    await expect(drain(provider.completeWithToolsStream([], []))).rejects.toBeInstanceOf(
      LlmProviderError,
    );

    expect(charge.refund).not.toHaveBeenCalled();
  });

  it('does not refund an error that is not the provider failing', async () => {
    const { provider, charge } = build({
      complete: vi.fn().mockRejectedValue(new Error('aborted')),
    });

    await expect(provider.complete([])).rejects.toThrow('aborted');

    expect(charge.refund).not.toHaveBeenCalled();
  });
});
