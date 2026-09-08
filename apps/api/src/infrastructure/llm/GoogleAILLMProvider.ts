import type {
  ILLMProvider,
  LLMMessage,
  LLMToolDefinition,
  LLMCompleteOptions,
  LLMCompleteResult,
  LLMToolCall,
  LLMStreamEvent,
  LLMUsage,
} from '#src/use-cases/ports/ILLMProvider.js';
import { LLM } from '#src/use-cases/constants.js';
import {
  fetchWithRetry,
  createIdleAbortController,
} from '#src/infrastructure/llm/fetchWithRetry.js';
import { parseSSE } from '#src/infrastructure/llm/sseParser.js';
import { providerHttpError } from '#src/infrastructure/llm/providerError.js';

interface GoogleAIPart {
  text?: string;
  functionCall?: { name: string; args?: Record<string, unknown> };
  functionResponse?: { name: string; response: Record<string, unknown> };
}

interface GoogleAIWireUsage {
  promptTokenCount: number;
  candidatesTokenCount: number;
  /** Prompt tokens served from Gemini's implicit or explicit cache; part of promptTokenCount. */
  cachedContentTokenCount?: number;
}

interface GoogleAIWireResponse {
  candidates?: Array<{ content?: { parts?: GoogleAIPart[] }; finishReason?: string }>;
  usageMetadata?: GoogleAIWireUsage;
}

function toLLMUsage(usage: GoogleAIWireUsage | undefined): LLMUsage | null {
  if (!usage) return null;
  return {
    promptTokens: usage.promptTokenCount,
    completionTokens: usage.candidatesTokenCount,
    ...(typeof usage.cachedContentTokenCount === 'number'
      ? { cacheReadTokens: usage.cachedContentTokenCount }
      : {}),
  };
}

/**
 * No prompt-caching wiring here, unlike `AnthropicLLMProvider`'s explicit
 * `cache_control` (JEF-238 investigation):
 *
 * - Gemini's *implicit* (automatic, no-code) caching only applies to Gemini
 *   2.5+ models — which is why `LLM.GOOGLEAI_DEFAULT_MODEL` moved from
 *   `gemini-2.0-flash` (not eligible at all) to `gemini-2.5-flash` (T4).
 * - Even on a 2.5+ model, implicit caching needs a minimum prefix (2,048
 *   tokens for 2.5 Flash/Pro, 4,096 for newer Flash/Pro Preview tiers) — our
 *   system prompt plus the read-tool catalogue chat actually sends is only
 *   ~2,000–2,500 tokens by rough estimate, so it sits right at that floor,
 *   not comfortably above it; a conversation with any history clears it.
 *   `usage.cachedContentTokenCount` is recorded per event (T3), so whether
 *   it actually hits is now visible in the usage summary.
 * - Gemini's *explicit* caching (a durable, named `CachedContents` resource,
 *   created/refreshed via a separate API call with its own TTL) would work
 *   regardless of model/size, but is a real feature to build — resource
 *   lifecycle, TTL refresh, a place to persist the resource name per
 *   provider/key — not a one-line `cache_control`-style flag.
 *
 * Net: nothing to change here today. If/when the default (or a user's
 * chosen) model moves to 2.5+, implicit caching applies automatically with
 * no code change, the same as OpenAI's — the lever is model choice, not this
 * provider.
 */
export class GoogleAILLMProvider implements ILLMProvider {
  constructor(
    private readonly apiKey: string,
    private readonly model: string = LLM.GOOGLEAI_DEFAULT_MODEL,
  ) {}

  async complete(
    messages: LLMMessage[],
    maxTokens: number = LLM.DEFAULT_MAX_TOKENS,
    signal?: AbortSignal,
    options?: LLMCompleteOptions,
  ): Promise<LLMCompleteResult> {
    if (!this.apiKey) throw new Error('Google AI API key is not set');

    // Gemini's `contents[].role` is `user` or `model` only; system text is
    // the top-level `systemInstruction`. This method mapped `system` straight
    // through as a role, which the API rejects — so every single-shot
    // feature failed on Google AI while chat (which already split) worked.
    const { systemInstruction, conversation } = this.splitSystem(messages);
    const contents = conversation.map((m) => ({
      role: m.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: m.content }],
    }));

    const json = await this.post(
      {
        contents,
        ...(systemInstruction
          ? { systemInstruction: { parts: [{ text: systemInstruction }] } }
          : {}),
        generationConfig: {
          maxOutputTokens: Math.min(maxTokens, LLM.MAX_OUTPUT_TOKENS_CAP),
          // Gemini's JSON mode (F6): the reply is a bare JSON document, never fenced.
          ...(options?.json ? { responseMimeType: 'application/json' } : {}),
        },
      },
      signal,
    );

    return {
      content: json.candidates?.[0]?.content?.parts?.[0]?.text ?? '',
      usage: toLLMUsage(json.usageMetadata),
      truncated: json.candidates?.[0]?.finishReason === 'MAX_TOKENS',
    };
  }

  /**
   * Streams via `:streamGenerateContent?alt=sse` (F8). Each SSE frame is a
   * whole `GenerateContentResponse`: text parts carry the next slice of the
   * reply (yielded as they arrive), `functionCall` parts arrive complete in
   * one frame, and `usageMetadata` on the final frame is the cumulative
   * count. Before this the provider called the blocking endpoint and yielded
   * a single `done`, so a Gemini-backed chat painted its reply all at once.
   */
  async *completeWithToolsStream(
    messages: LLMMessage[],
    tools: LLMToolDefinition[],
    maxTokens: number = LLM.DEFAULT_MAX_TOKENS,
    signal?: AbortSignal,
  ): AsyncGenerator<LLMStreamEvent> {
    if (!this.apiKey) throw new Error('Google AI API key is not set');

    const { systemInstruction, conversation: turns } = this.splitSystem(messages);

    // Gemini's functionResponse is keyed by function name, not an opaque call
    // id — recover the name from the assistant message that requested it.
    const idToName = new Map<string, string>();
    for (const m of messages) {
      if (m.role === 'assistant' && m.toolCalls) {
        for (const tc of m.toolCalls) idToName.set(tc.id, tc.name);
      }
    }

    const contents = turns.map((m) => this.toWireContent(m, idToName));

    const { body, onChunk, dispose } = await this.postStream(
      {
        contents,
        ...(systemInstruction
          ? { systemInstruction: { parts: [{ text: systemInstruction }] } }
          : {}),
        tools: [
          {
            functionDeclarations: tools.map((t) => ({
              name: t.name,
              description: t.description,
              parameters: t.parameters,
            })),
          },
        ],
        generationConfig: { maxOutputTokens: Math.min(maxTokens, LLM.MAX_OUTPUT_TOKENS_CAP) },
      },
      signal,
    );

    let text = '';
    const toolCalls: LLMToolCall[] = [];
    let usage: LLMUsage | null = null;

    try {
      for await (const frame of parseSSE(body, onChunk)) {
        const chunk = JSON.parse(frame.data) as GoogleAIWireResponse;
        if (chunk.usageMetadata) usage = toLLMUsage(chunk.usageMetadata);
        for (const part of chunk.candidates?.[0]?.content?.parts ?? []) {
          if (part.text) {
            text += part.text;
            yield { type: 'text_delta', text: part.text };
          }
          if (part.functionCall) {
            toolCalls.push({
              id: `${part.functionCall.name}-${toolCalls.length}`,
              name: part.functionCall.name,
              arguments: part.functionCall.args ?? {},
            });
          }
        }
      }
    } finally {
      dispose();
    }

    yield { type: 'done', content: text || null, toolCalls, usage };
  }

  /** Gemini takes system text as a top-level field, never as a content role. */
  private splitSystem(messages: LLMMessage[]): {
    systemInstruction: string;
    conversation: LLMMessage[];
  } {
    return {
      systemInstruction: messages
        .filter((m) => m.role === 'system')
        .map((m) => m.content)
        .join('\n\n'),
      conversation: messages.filter((m) => m.role !== 'system'),
    };
  }

  private toWireContent(
    m: LLMMessage,
    idToName: Map<string, string>,
  ): { role: string; parts: GoogleAIPart[] } {
    if (m.role === 'tool') {
      const name = idToName.get(m.toolCallId ?? '') ?? m.toolCallId ?? '';
      return {
        role: 'function',
        parts: [{ functionResponse: { name, response: { content: m.content } } }],
      };
    }
    if (m.role === 'assistant' && m.toolCalls?.length) {
      return {
        role: 'model',
        parts: m.toolCalls.map((tc) => ({ functionCall: { name: tc.name, args: tc.arguments } })),
      };
    }
    return { role: m.role === 'assistant' ? 'model' : m.role, parts: [{ text: m.content }] };
  }

  private headers(): Record<string, string> {
    return { 'Content-Type': 'application/json', 'x-goog-api-key': this.apiKey };
  }

  private async postStream(
    body: Record<string, unknown>,
    signal?: AbortSignal,
  ): Promise<{ body: ReadableStream<Uint8Array>; onChunk: () => void; dispose: () => void }> {
    // Idle-reset rather than a fixed timeout — see `createIdleAbortController`.
    const idle = createIdleAbortController(LLM.STREAM_IDLE_TIMEOUT_MS, signal);
    const url = `${LLM.GOOGLEAI_API_URL}/${this.model}:streamGenerateContent?alt=sse`;
    const response = await fetchWithRetry(
      url,
      { method: 'POST', headers: this.headers(), body: JSON.stringify(body) },
      idle.signal,
      null,
    );

    if (!response.ok) {
      idle.dispose();
      const text = await response.text();
      throw providerHttpError('Google AI', response.status, text);
    }
    if (!response.body) {
      idle.dispose();
      throw new Error('Google AI error: response had no body to stream');
    }

    return { body: response.body, onChunk: idle.activity, dispose: idle.dispose };
  }

  private async post(
    body: Record<string, unknown>,
    signal?: AbortSignal,
  ): Promise<GoogleAIWireResponse> {
    // The key travels in a header, never the query string: outbound fetch
    // spans (OTel's undici instrumentation records `url.full`), proxy access
    // logs and error causes all keep the URL verbatim. Google accepts the
    // same key as `x-goog-api-key`. The model id is validated on the way in
    // (`assertValidLlmModelId`), so it cannot re-target the path.
    const url = `${LLM.GOOGLEAI_API_URL}/${this.model}:generateContent`;

    const response = await fetchWithRetry(
      url,
      { method: 'POST', headers: this.headers(), body: JSON.stringify(body) },
      signal,
    );

    if (!response.ok) {
      const text = await response.text();
      throw providerHttpError('Google AI', response.status, text);
    }

    return response.json() as Promise<GoogleAIWireResponse>;
  }
}
