import type {
  ILLMProvider,
  LLMMessage,
  LLMToolDefinition,
  LLMStreamEvent,
  LLMCompleteOptions,
  LLMCompleteResult,
  LLMUsage,
} from '#src/use-cases/ports/ILLMProvider.js';
import type { IOutboundUrlPolicy } from '#src/use-cases/ports/IOutboundUrlPolicy.js';
import { LLM } from '#src/use-cases/constants.js';
import { AUTH_HEADER } from '#src/infrastructure/config/constants.js';
import {
  fetchWithRetry,
  createIdleAbortController,
} from '#src/infrastructure/llm/fetchWithRetry.js';
import { parseSSE } from '#src/infrastructure/llm/sseParser.js';
import { providerHttpError } from '#src/infrastructure/llm/providerError.js';

interface OpenAIWireMessage {
  role: string;
  content: string | null;
  tool_call_id?: string;
  tool_calls?: Array<{
    id: string;
    type: 'function';
    function: { name: string; arguments: string };
  }>;
}

interface OpenAIWireUsage {
  prompt_tokens: number;
  completion_tokens: number;
  /** OpenAI reports automatic prefix-cache hits here; most compatible backends omit it. */
  prompt_tokens_details?: { cached_tokens?: number } | null;
}

interface OpenAIWireResponse {
  choices: Array<{
    message: {
      content: string | null;
      tool_calls?: Array<{ id: string; function: { name: string; arguments: string } }>;
    };
    finish_reason?: string | null;
  }>;
  usage?: OpenAIWireUsage;
}

function toLLMUsage(usage: OpenAIWireUsage | null | undefined): LLMUsage | null {
  if (!usage) return null;
  const cached = usage.prompt_tokens_details?.cached_tokens;
  return {
    promptTokens: usage.prompt_tokens,
    completionTokens: usage.completion_tokens,
    ...(typeof cached === 'number' ? { cacheReadTokens: cached } : {}),
  };
}

const OPENAI_STREAM_DONE = '[DONE]';

/**
 * One `chat.completion.chunk` object. `delta.tool_calls` entries are keyed
 * by `index` (supports parallel tool calls); `id`/`function.name` typically
 * arrive once on a call's first chunk and subsequent chunks for the same
 * index carry only `function.arguments` fragments to concatenate — but this
 * provider merges whichever fields are present per chunk rather than
 * assuming that ordering, which costs nothing and is robust either way.
 */
interface OpenAIStreamChunk {
  choices?: Array<{
    delta?: {
      content?: string | null;
      tool_calls?: Array<{
        index: number;
        id?: string;
        function?: { name?: string; arguments?: string };
      }>;
    };
  }>;
  /**
   * Only present on the final chunk, and only when the request opts in via
   * `stream_options.include_usage` — that chunk's `choices` is empty, so
   * this must be read independently of the `delta` handling below.
   */
  usage?: OpenAIWireUsage | null;
}

/**
 * Covers every provider that implements OpenAI's `/chat/completions` request
 * and response shape — OpenAI itself, OpenRouter, Mistral, Groq, xAI,
 * DeepSeek, and any user-supplied custom endpoint. Only the base URL and
 * default model differ between them, which the caller supplies.
 *
 * Unlike Anthropic (`AnthropicLLMProvider`), this provider sets no explicit
 * `cache_control` — OpenAI applies prompt caching automatically, no request
 * changes required, to any prompt >=1024 tokens whose prefix repeats
 * byte-for-byte across calls (OpenAI's own OpenAI-compatible-shaped
 * competitors that support caching, e.g. DeepSeek, work the same way).
 * `StreamChatWithAssistantUseCase` already builds messages with the stable part —
 * system prompt, then the user's `customAiPrompt` if set — first and the
 * per-turn conversation appended after, which is exactly the shape automatic
 * prefix caching needs (JEF-238). Nothing to wire here; the `tools` array
 * (also identical on every call, per `chatTools` in `http/di`) is static
 * too, so the whole cacheable block only grows as a conversation's history
 * grows, never shrinks or reorders.
 */
export class OpenAICompatibleLLMProvider implements ILLMProvider {
  /**
   * `outboundUrlPolicy` is set only for the "Custom" provider, whose base
   * URL the user typed: the vendor endpoints are fixed constants and need no
   * check. It runs on every call, not just at save time, because the name a
   * user saved can be re-pointed at a private address afterwards.
   */
  constructor(
    private readonly apiKey: string,
    private readonly baseUrl: string,
    private readonly model: string,
    private readonly outboundUrlPolicy?: IOutboundUrlPolicy,
  ) {}

  async complete(
    messages: LLMMessage[],
    maxTokens: number = LLM.DEFAULT_MAX_TOKENS,
    signal?: AbortSignal,
    options?: LLMCompleteOptions,
  ): Promise<LLMCompleteResult> {
    if (!this.apiKey) throw new Error('API key is not set');
    await this.outboundUrlPolicy?.assertAllowed(this.baseUrl, 'llm-provider');

    const json = await this.post(
      {
        model: this.model,
        messages: this.toWireMessages(messages),
        max_tokens: Math.min(maxTokens, LLM.MAX_OUTPUT_TOKENS_CAP),
        // OpenAI's JSON mode (F6); requires the word "JSON" in the prompt,
        // which every caller that asks for it already has. Compatible
        // backends that do not know the field ignore it.
        ...(options?.json ? { response_format: { type: 'json_object' } } : {}),
      },
      signal,
    );

    return {
      content: json.choices[0]?.message?.content ?? '',
      usage: toLLMUsage(json.usage),
      truncated: json.choices[0]?.finish_reason === 'length',
    };
  }

  async *completeWithToolsStream(
    messages: LLMMessage[],
    tools: LLMToolDefinition[],
    maxTokens: number = LLM.DEFAULT_MAX_TOKENS,
    signal?: AbortSignal,
  ): AsyncGenerator<LLMStreamEvent> {
    if (!this.apiKey) throw new Error('API key is not set');
    await this.outboundUrlPolicy?.assertAllowed(this.baseUrl, 'llm-provider');

    const { body, onChunk, dispose } = await this.postStream(
      {
        model: this.model,
        messages: this.toWireMessages(messages),
        max_tokens: Math.min(maxTokens, LLM.MAX_OUTPUT_TOKENS_CAP),
        stream: true,
        stream_options: { include_usage: true },
        tools: tools.map((t) => ({
          type: 'function',
          function: { name: t.name, description: t.description, parameters: t.parameters },
        })),
      },
      signal,
    );

    let content = '';
    const toolCalls = new Map<number, { id: string; name: string; arguments: string }>();
    let usage: LLMUsage | null = null;

    try {
      for await (const frame of parseSSE(body, onChunk)) {
        if (frame.data === OPENAI_STREAM_DONE) break;

        const chunk = JSON.parse(frame.data) as OpenAIStreamChunk;
        // The usage-bearing final chunk has empty `choices` — read it
        // independently rather than folding it into the `!delta` guard below.
        if (chunk.usage) usage = toLLMUsage(chunk.usage);

        const delta = chunk.choices?.[0]?.delta;
        if (!delta) continue;

        if (delta.content) {
          content += delta.content;
          yield { type: 'text_delta', text: delta.content };
        }

        for (const tc of delta.tool_calls ?? []) {
          const existing = toolCalls.get(tc.index) ?? { id: '', name: '', arguments: '' };
          toolCalls.set(tc.index, {
            id: tc.id ?? existing.id,
            name: tc.function?.name ?? existing.name,
            arguments: existing.arguments + (tc.function?.arguments ?? ''),
          });
        }
      }
    } finally {
      dispose();
    }

    yield {
      type: 'done',
      content: content || null,
      toolCalls: [...toolCalls.values()].map((tc) => ({
        id: tc.id,
        name: tc.name,
        arguments: this.parseArguments(tc.arguments),
      })),
      usage,
    };
  }

  private toWireMessages(messages: LLMMessage[]): OpenAIWireMessage[] {
    return messages.map((m) => {
      if (m.role === 'tool') {
        return { role: 'tool', tool_call_id: m.toolCallId, content: m.content };
      }
      if (m.role === 'assistant' && m.toolCalls?.length) {
        return {
          role: 'assistant',
          content: m.content || null,
          tool_calls: m.toolCalls.map((tc) => ({
            id: tc.id,
            type: 'function',
            function: { name: tc.name, arguments: JSON.stringify(tc.arguments) },
          })),
        };
      }
      return { role: m.role, content: m.content };
    });
  }

  private parseArguments(raw: string): Record<string, unknown> {
    try {
      return JSON.parse(raw) as Record<string, unknown>;
    } catch {
      return {};
    }
  }

  private async post(
    body: Record<string, unknown>,
    signal?: AbortSignal,
  ): Promise<OpenAIWireResponse> {
    const response = await fetchWithRetry(
      this.baseUrl,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `${AUTH_HEADER.BEARER_PREFIX}${this.apiKey}`,
        },
        body: JSON.stringify(body),
      },
      signal,
    );

    if (!response.ok) {
      const text = await response.text();
      throw providerHttpError('LLM provider', response.status, text);
    }

    return response.json() as Promise<OpenAIWireResponse>;
  }

  private async postStream(
    body: Record<string, unknown>,
    signal?: AbortSignal,
  ): Promise<{ body: ReadableStream<Uint8Array>; onChunk: () => void; dispose: () => void }> {
    // See `createIdleAbortController`'s doc comment: a streaming reply can
    // legitimately run well past a normal request's timeout as long as bytes
    // keep arriving, so this resets on every chunk instead of capping total
    // duration.
    const idle = createIdleAbortController(LLM.STREAM_IDLE_TIMEOUT_MS, signal);
    const response = await fetchWithRetry(
      this.baseUrl,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `${AUTH_HEADER.BEARER_PREFIX}${this.apiKey}`,
        },
        body: JSON.stringify(body),
      },
      idle.signal,
      null,
    );

    if (!response.ok) {
      idle.dispose();
      const text = await response.text();
      throw providerHttpError('LLM provider', response.status, text);
    }
    if (!response.body) {
      idle.dispose();
      throw new Error('LLM provider error: response had no body to stream');
    }

    return { body: response.body, onChunk: idle.activity, dispose: idle.dispose };
  }
}
