export interface LLMToolCall {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
}

export interface LLMMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
  /** Present on a 'tool' message: which tool call this is the result for. */
  toolCallId?: string;
  /** Present on an 'assistant' message that requested tool calls. */
  toolCalls?: LLMToolCall[];
  /**
   * Marks this as the end of a cacheable prefix (cache everything up to and
   * including this block). Providers with explicit cache control (Anthropic)
   * act on it; providers that cache automatically (OpenAI-compatible, Google
   * AI) simply ignore it.
   */
  cacheBreakpoint?: boolean;
}

export interface LLMToolDefinition {
  name: string;
  description: string;
  /** JSON Schema object describing the tool's arguments. */
  parameters: Record<string, unknown>;
  /** See `LLMMessage.cacheBreakpoint` — same semantics, applied to the tools list. */
  cacheBreakpoint?: boolean;
}

/**
 * Token counts for one completed call, as reported by the provider's own
 * response (JEF-250) — `null` when a response doesn't report usage at all
 * (a provider outage returning a malformed body, or an OpenAI-compatible
 * backend that ignores `stream_options.include_usage`), rather than
 * fabricating a number. `promptTokens` is the total the provider counted
 * as input, cache hits included — Anthropic's `cache_creation_input_tokens`
 * and `cache_read_input_tokens` are folded in, so the monthly meter reads
 * slightly high on a cache hit (cache reads are priced lower) — and the
 * optional cache fields break that total down when the provider says.
 */
export interface LLMUsage {
  promptTokens: number;
  completionTokens: number;
  /**
   * Of `promptTokens`, the part the provider served from its prompt cache
   * and the part it wrote to it (T3). `promptTokens` still includes both,
   * so callers that only care about the total are unaffected. Absent when
   * the provider does not report the split.
   */
  cacheReadTokens?: number;
  cacheWriteTokens?: number;
  /**
   * Of `completionTokens`, the hidden thinking/reasoning tokens the provider
   * billed at the output price (JEF-445) — Gemini's `thoughtsTokenCount`,
   * OpenAI's `completion_tokens_details.reasoning_tokens`. Absent when the
   * provider does not report it.
   */
  reasoningTokens?: number;
  /** Workers AI's billing unit for the call (JEF-497); absent when the response carried none. */
  neurons?: number;
  /**
   * The response carried reasoning output (`reasoning` or `reasoning_content`),
   * which Workers AI does not count separately (JEF-497). Set only when seen.
   */
  reasoningReturned?: boolean;
}

/**
 * Which provider and model produced a reply (JEF-547), stamped by the usage
 * tracker that wraps each leg of a failover. Because every leg carries its own,
 * the value a caller sees names the leg that answered, not the one tried first.
 * Absent when the call is not usage-tracked (a key test).
 */
export interface LLMAnsweredBy {
  provider: string;
  model: string | null;
  /** `LlmUsageSource`. */
  source: string;
  /** The hosted model tier; absent on the user's own key. */
  tier?: string;
}

export interface LLMCompleteResult {
  content: string;
  usage: LLMUsage | null;
  answeredBy?: LLMAnsweredBy;
  /**
   * The provider stopped because the output budget ran out (Anthropic
   * `stop_reason: max_tokens`, OpenAI `finish_reason: length`, Gemini
   * `finishReason: MAX_TOKENS`) — so `content` is cut off mid-thought.
   * Callers that parse the reply check this first (F2): a truncated JSON
   * document fails parsing indistinguishably from a malformed one, and the
   * remedy is different.
   */
  truncated?: boolean;
}

/**
 * Return shape of a fully-assembled tool-calling completion — not on
 * `ILLMProvider` itself (no provider exposes a non-streaming tool-calling
 * method; see JEF-245), but still the shape `LLMStreamEvent`'s `done` event
 * carries, and what `GoogleAILLMProvider` returns from its own internal,
 * non-port `completeWithTools` (Gemini doesn't genuinely stream — see that
 * class).
 */
export interface LLMCompletionResult {
  content: string | null;
  toolCalls: LLMToolCall[];
  usage: LLMUsage | null;
}

/**
 * Emitted by `completeWithToolsStream` (JEF-239). `text_delta` events carry
 * incremental assistant text as it arrives; exactly one `done` carries the
 * fully-assembled result (`LLMCompletionResult`'s shape) and always
 * terminates the stream, whether or not any deltas preceded it. Providers
 * that don't genuinely stream (Google — see `GoogleAILLMProvider`) satisfy
 * this by yielding only the `done` event.
 */
export type LLMStreamEvent =
  | { type: 'text_delta'; text: string }
  /**
   * The prompt has been counted, before any output exists — Anthropic
   * reports it on `message_start`. Emitted so a stream that is aborted
   * mid-reply (client disconnect) can still be charged for the input the
   * provider already billed; `done` repeats the figure with the output
   * count. Providers that only learn usage at the end never emit it.
   * Consumers other than the usage tracker should ignore it.
   */
  | { type: 'prompt_usage'; promptTokens: number }
  /**
   * The provider that was answering failed before any output and another one
   * from the user's order took over (JEF-503). Emitted once per switch, ahead of
   * the new provider's own events, by the fallback wrapper; no provider emits it.
   * `from` and `to` are order entries: `trakwyn` or the id of one of the user's keys.
   */
  | { type: 'fallback'; from: string; to: string }
  | {
      type: 'done';
      content: string | null;
      toolCalls: LLMToolCall[];
      usage: LLMUsage | null;
      answeredBy?: LLMAnsweredBy;
    };

/**
 * Per-call switches for `complete()` (F6). `json` asks the provider to
 * constrain the reply to a JSON object where it has such a mode — OpenAI's
 * `response_format`, Gemini's `responseMimeType` — so the callers that
 * parse the reply get fewer fenced or chatty answers. Providers without a
 * matching switch ignore it; the prompt still says "return only JSON".
 */
export interface LLMCompleteOptions extends LLMStreamOptions {
  json?: boolean;
}

/**
 * How much hidden thinking a call may spend (JEF-445). `off` is the
 * provider's lowest setting (some models cannot go fully off), `low` a small
 * budget, `default` leaves the provider's own behaviour untouched. A provider
 * or model without a matching switch ignores it rather than sending a
 * parameter that could be refused.
 */
export type LLMReasoning = 'off' | 'low' | 'default';

/** Per-call switches shared by `complete()` and `completeWithToolsStream()`. */
export interface LLMStreamOptions {
  reasoning?: LLMReasoning;
}

export interface ILLMProvider {
  complete(
    messages: LLMMessage[],
    maxTokens?: number,
    signal?: AbortSignal,
    options?: LLMCompleteOptions,
  ): Promise<LLMCompleteResult>;
  completeWithToolsStream(
    messages: LLMMessage[],
    tools: LLMToolDefinition[],
    maxTokens?: number,
    signal?: AbortSignal,
    options?: LLMStreamOptions,
  ): AsyncGenerator<LLMStreamEvent>;
}
