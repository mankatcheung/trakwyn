import { LlmProviderError, type LlmProviderErrorKind } from '#src/use-cases/errors/DomainError.js';
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
 * Failures worth another provider from the user's order (JEF-503): the one that
 * was answering is busy, down, unreachable, refused its key or is out of credit.
 * Not `bad_request`: the request itself is wrong, so the next provider would
 * refuse it too.
 */
const FALLBACK_KINDS: ReadonlySet<LlmProviderErrorKind> = new Set([
  'rate_limited',
  'unavailable',
  'unreachable',
  'auth',
  'quota',
]);

function shouldFallBack(err: unknown): err is LlmProviderError {
  return err instanceof LlmProviderError && FALLBACK_KINDS.has(err.kind);
}

/** The next provider in the user's order that can run, already tracked and charged like any other resolution. */
export interface FallbackLeg {
  provider: ILLMProvider;
  /** The order entry it answers for: `trakwyn` or the id of one of the user's keys. */
  entry: string;
}

/**
 * Walks the user's provider order while a call is running (JEF-503).
 *
 * When the provider that is answering fails with a kind in `FALLBACK_KINDS`,
 * `next` is asked for the next entry that can run, and the same call is made on
 * it. Never after the caller has been handed an event (a half-streamed answer
 * cannot be restarted somewhere else), never on a cancelled call, and never on
 * a provider the user did not list: `next` is the only source of candidates, and
 * it is built from the order.
 *
 * `next` is lazy so a provider further down the order costs nothing, and takes
 * no hosted credits, unless it is actually used. It returns null once nothing is
 * left, and the failure the user sees is then the last provider's own.
 *
 * The switch is sticky for the lifetime of this object: a chat turn resolves
 * once and calls the provider again for each tool round, and every round should
 * go where the first one ended up rather than retry the failed provider.
 */
export class OrderedFallbackLLMProvider implements ILLMProvider {
  private current: ILLMProvider;
  private currentEntry: string;

  constructor(
    primary: ILLMProvider,
    primaryEntry: string,
    private readonly next: () => Promise<FallbackLeg | null>,
    private readonly onFallback?: (from: string, to: string, err: LlmProviderError) => void,
  ) {
    this.current = primary;
    this.currentEntry = primaryEntry;
  }

  async complete(
    messages: LLMMessage[],
    maxTokens?: number,
    signal?: AbortSignal,
    options?: LLMCompleteOptions,
  ): Promise<LLMCompleteResult> {
    for (;;) {
      try {
        return await this.current.complete(messages, maxTokens, signal, options);
      } catch (err) {
        if (signal?.aborted || !shouldFallBack(err)) throw err;
        if (!(await this.switchAfter(err))) throw err;
      }
    }
  }

  async *completeWithToolsStream(
    messages: LLMMessage[],
    tools: LLMToolDefinition[],
    maxTokens?: number,
    signal?: AbortSignal,
    options?: LLMStreamOptions,
  ): AsyncGenerator<LLMStreamEvent> {
    for (;;) {
      let started = false;
      try {
        for await (const event of this.current.completeWithToolsStream(
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
        if (started || signal?.aborted || !shouldFallBack(err)) throw err;
        const from = this.currentEntry;
        if (!(await this.switchAfter(err))) throw err;
        yield { type: 'fallback', from, to: this.currentEntry };
      }
    }
  }

  /** Moves to the next entry that can run; false when none is left. */
  private async switchAfter(err: LlmProviderError): Promise<boolean> {
    const leg = await this.next();
    if (!leg) return false;
    this.onFallback?.(this.currentEntry, leg.entry, err);
    this.current = leg.provider;
    this.currentEntry = leg.entry;
    return true;
  }
}
