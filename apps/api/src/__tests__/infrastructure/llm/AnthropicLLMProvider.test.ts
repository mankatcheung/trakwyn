import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { AnthropicLLMProvider } from '#src/infrastructure/llm/AnthropicLLMProvider.js';
import { LLM } from '#src/use-cases/constants.js';
import type { LLMMessage } from '#src/use-cases/ports/ILLMProvider.js';

const jsonResponse = (body: unknown, ok = true, status = 200) => ({
  ok,
  status,
  json: () => Promise.resolve(body),
  text: () => Promise.resolve(JSON.stringify(body)),
});

const streamResponse = (sseText: string, ok = true, status = 200) => ({
  ok,
  status,
  body: new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(new TextEncoder().encode(sseText));
      controller.close();
    },
  }),
  text: () => Promise.resolve(sseText),
});

/**
 * Like `streamResponse`, but delivers each SSE frame `gapMs` apart instead
 * of all at once — for asserting streaming behavior over elapsed time (e.g.
 * the idle-timeout regression test) under `vi.useFakeTimers()`.
 */
const delayedStreamResponse = (frames: string[], gapMs: number, ok = true, status = 200) => {
  const encoder = new TextEncoder();
  let i = 0;
  return {
    ok,
    status,
    body: new ReadableStream<Uint8Array>({
      pull(controller) {
        if (i >= frames.length) {
          controller.close();
          return;
        }
        const frame = frames[i];
        i++;
        return new Promise<void>((resolve) => {
          setTimeout(() => {
            controller.enqueue(encoder.encode(frame));
            resolve();
          }, gapMs);
        });
      },
    }),
    text: () => Promise.resolve(frames.join('')),
  };
};

async function collectStream(
  provider: AnthropicLLMProvider,
  ...args: Parameters<AnthropicLLMProvider['completeWithToolsStream']>
) {
  const events = [];
  for await (const event of provider.completeWithToolsStream(...args)) events.push(event);
  return events;
}

describe('AnthropicLLMProvider', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  describe('constructor', () => {
    it('falls back to the default model when none is given', async () => {
      vi.mocked(fetch).mockResolvedValue(
        jsonResponse({ content: [{ type: 'text', text: 'ok' }] }) as never,
      );

      const provider = new AnthropicLLMProvider('test-key');
      await provider.complete([{ role: 'user', content: 'hi' }]);

      const [, options] = vi.mocked(fetch).mock.calls[0] as [string, RequestInit];
      const body = JSON.parse(options.body as string);
      expect(body.model).toBe(LLM.ANTHROPIC_DEFAULT_MODEL);
    });

    it('uses the given model when provided', async () => {
      vi.mocked(fetch).mockResolvedValue(
        jsonResponse({ content: [{ type: 'text', text: 'ok' }] }) as never,
      );

      const provider = new AnthropicLLMProvider('test-key', 'claude-custom');
      await provider.complete([{ role: 'user', content: 'hi' }]);

      const [, options] = vi.mocked(fetch).mock.calls[0] as [string, RequestInit];
      const body = JSON.parse(options.body as string);
      expect(body.model).toBe('claude-custom');
    });
  });

  describe('complete', () => {
    it('throws when the API key is empty', async () => {
      const provider = new AnthropicLLMProvider('');

      await expect(provider.complete([{ role: 'user', content: 'hi' }])).rejects.toThrow(
        'Anthropic API key is not set',
      );
      expect(fetch).not.toHaveBeenCalled();
    });

    it('forwards a caller-supplied signal into the outbound fetch (JEF-240)', async () => {
      vi.mocked(fetch).mockImplementation(() => new Promise(() => {}));
      const controller = new AbortController();
      const provider = new AnthropicLLMProvider('secret-key');

      void provider.complete([{ role: 'user', content: 'hi' }], undefined, controller.signal);
      await Promise.resolve();

      const [, options] = vi.mocked(fetch).mock.calls[0] as [string, RequestInit];
      expect(options.signal!.aborted).toBe(false);
      controller.abort();
      expect(options.signal!.aborted).toBe(true);
    });

    it('sends the API key and version as headers', async () => {
      vi.mocked(fetch).mockResolvedValue(
        jsonResponse({ content: [{ type: 'text', text: 'ok' }] }) as never,
      );

      const provider = new AnthropicLLMProvider('secret-key');
      await provider.complete([{ role: 'user', content: 'hi' }], 256);

      const [url, options] = vi.mocked(fetch).mock.calls[0] as [string, RequestInit];
      expect(url).toBe(LLM.ANTHROPIC_API_URL);
      const headers = options.headers as Record<string, string>;
      expect(headers['x-api-key']).toBe('secret-key');
      expect(headers['anthropic-version']).toBe(LLM.ANTHROPIC_VERSION);

      const body = JSON.parse(options.body as string);
      expect(body.max_tokens).toBe(256);
    });

    it('moves the system message to a top-level `system` field', async () => {
      vi.mocked(fetch).mockResolvedValue(
        jsonResponse({ content: [{ type: 'text', text: 'ok' }] }) as never,
      );

      const provider = new AnthropicLLMProvider('secret-key');
      const messages: LLMMessage[] = [
        { role: 'system', content: 'be helpful' },
        { role: 'user', content: 'hello' },
        { role: 'assistant', content: 'hi there' },
      ];
      await provider.complete(messages);

      const [, options] = vi.mocked(fetch).mock.calls[0] as [string, RequestInit];
      const body = JSON.parse(options.body as string);
      expect(body.system).toBe('be helpful');
      expect(body.messages).toEqual([
        { role: 'user', content: 'hello' },
        { role: 'assistant', content: 'hi there' },
      ]);
    });

    it('omits the `system` field when there is no system message', async () => {
      vi.mocked(fetch).mockResolvedValue(
        jsonResponse({ content: [{ type: 'text', text: 'ok' }] }) as never,
      );

      const provider = new AnthropicLLMProvider('secret-key');
      await provider.complete([{ role: 'user', content: 'hello' }]);

      const [, options] = vi.mocked(fetch).mock.calls[0] as [string, RequestInit];
      const body = JSON.parse(options.body as string);
      expect(body.system).toBeUndefined();
    });

    it('defaults maxTokens to 512 when not provided', async () => {
      vi.mocked(fetch).mockResolvedValue(
        jsonResponse({ content: [{ type: 'text', text: 'ok' }] }) as never,
      );

      const provider = new AnthropicLLMProvider('secret-key');
      await provider.complete([{ role: 'user', content: 'hi' }]);

      const [, options] = vi.mocked(fetch).mock.calls[0] as [string, RequestInit];
      const body = JSON.parse(options.body as string);
      expect(body.max_tokens).toBe(512);
    });

    it('clamps a maxTokens request above the hard ceiling (JEF-126)', async () => {
      vi.mocked(fetch).mockResolvedValue(
        jsonResponse({ content: [{ type: 'text', text: 'ok' }] }) as never,
      );

      const provider = new AnthropicLLMProvider('secret-key');
      await provider.complete([{ role: 'user', content: 'hi' }], 999_999);

      const [, options] = vi.mocked(fetch).mock.calls[0] as [string, RequestInit];
      const body = JSON.parse(options.body as string);
      expect(body.max_tokens).toBe(LLM.MAX_OUTPUT_TOKENS_CAP);
    });

    it('leaves an under-ceiling maxTokens request unchanged', async () => {
      vi.mocked(fetch).mockResolvedValue(
        jsonResponse({ content: [{ type: 'text', text: 'ok' }] }) as never,
      );

      const provider = new AnthropicLLMProvider('secret-key');
      await provider.complete([{ role: 'user', content: 'hi' }], 1024);

      const [, options] = vi.mocked(fetch).mock.calls[0] as [string, RequestInit];
      const body = JSON.parse(options.body as string);
      expect(body.max_tokens).toBe(1024);
    });

    it('returns the text of the first text content block', async () => {
      vi.mocked(fetch).mockResolvedValue(
        jsonResponse({ content: [{ type: 'text', text: 'generated response' }] }) as never,
      );

      const provider = new AnthropicLLMProvider('secret-key');
      const result = await provider.complete([{ role: 'user', content: 'hi' }]);

      expect(result.content).toBe('generated response');
    });

    it('returns an empty string when there is no text content block', async () => {
      vi.mocked(fetch).mockResolvedValue(jsonResponse({ content: [] }) as never);

      const provider = new AnthropicLLMProvider('secret-key');
      const result = await provider.complete([{ role: 'user', content: 'hi' }]);

      expect(result.content).toBe('');
    });

    it('flags a reply cut off by max_tokens (F2)', async () => {
      vi.mocked(fetch).mockResolvedValue(
        jsonResponse({
          content: [{ type: 'text', text: '{"a":' }],
          stop_reason: 'max_tokens',
        }) as never,
      );

      const provider = new AnthropicLLMProvider('secret-key');
      const result = await provider.complete([{ role: 'user', content: 'hi' }]);

      expect(result.truncated).toBe(true);
    });

    it('returns null usage when the response has no usage field', async () => {
      vi.mocked(fetch).mockResolvedValue(
        jsonResponse({ content: [{ type: 'text', text: 'ok' }] }) as never,
      );

      const provider = new AnthropicLLMProvider('secret-key');
      const result = await provider.complete([{ role: 'user', content: 'hi' }]);

      expect(result.usage).toBeNull();
    });

    it('parses usage from the response, folding cache tokens into promptTokens (JEF-250)', async () => {
      vi.mocked(fetch).mockResolvedValue(
        jsonResponse({
          content: [{ type: 'text', text: 'ok' }],
          usage: {
            input_tokens: 100,
            output_tokens: 40,
            cache_creation_input_tokens: 10,
            cache_read_input_tokens: 5,
          },
        }) as never,
      );

      const provider = new AnthropicLLMProvider('secret-key');
      const result = await provider.complete([{ role: 'user', content: 'hi' }]);

      expect(result.usage).toEqual({
        promptTokens: 115,
        completionTokens: 40,
        cacheReadTokens: 5,
        cacheWriteTokens: 10,
      });
    });

    it('throws with the status and body when the response is not ok', async () => {
      vi.mocked(fetch).mockResolvedValue(
        jsonResponse({ error: 'rate limited' }, false, 429) as never,
      );

      const provider = new AnthropicLLMProvider('secret-key');

      await expect(provider.complete([{ role: 'user', content: 'hi' }])).rejects.toThrow(
        /Anthropic error 429/,
      );
    });

    it('retries a transient 5xx failure and succeeds (JEF-110)', async () => {
      vi.useFakeTimers();
      try {
        vi.mocked(fetch)
          .mockResolvedValueOnce(jsonResponse({ error: 'unavailable' }, false, 503) as never)
          .mockResolvedValueOnce(
            jsonResponse({ content: [{ type: 'text', text: 'ok after retry' }] }) as never,
          );

        const provider = new AnthropicLLMProvider('secret-key');
        const promise = provider.complete([{ role: 'user', content: 'hi' }]);
        await vi.runAllTimersAsync();
        const result = await promise;

        expect(result.content).toBe('ok after retry');
        expect(fetch).toHaveBeenCalledTimes(2);
      } finally {
        vi.useRealTimers();
      }
    });

    it('does not retry a 4xx failure', async () => {
      vi.mocked(fetch).mockResolvedValue(jsonResponse({ error: 'bad key' }, false, 401) as never);

      const provider = new AnthropicLLMProvider('secret-key');

      await expect(provider.complete([{ role: 'user', content: 'hi' }])).rejects.toThrow(
        /Anthropic error 401/,
      );
      expect(fetch).toHaveBeenCalledTimes(1);
    });
  });

  describe('prompt caching', () => {
    it('keeps the bare-string system field when no system message is marked cacheBreakpoint', async () => {
      vi.mocked(fetch).mockResolvedValue(
        jsonResponse({ content: [{ type: 'text', text: 'ok' }] }) as never,
      );

      const provider = new AnthropicLLMProvider('secret-key');
      await provider.complete([
        { role: 'system', content: 'be helpful' },
        { role: 'user', content: 'hi' },
      ]);

      const [, options] = vi.mocked(fetch).mock.calls[0] as [string, RequestInit];
      const body = JSON.parse(options.body as string);
      expect(body.system).toBe('be helpful');
    });

    it('switches to a content-block system field, attaching cache_control only to the marked block', async () => {
      vi.mocked(fetch).mockResolvedValue(
        jsonResponse({ content: [{ type: 'text', text: 'ok' }] }) as never,
      );

      const provider = new AnthropicLLMProvider('secret-key');
      await provider.complete([
        { role: 'system', content: 'shared system prompt', cacheBreakpoint: true },
        { role: 'system', content: 'per-user custom prompt' },
        { role: 'user', content: 'hi' },
      ]);

      const [, options] = vi.mocked(fetch).mock.calls[0] as [string, RequestInit];
      const body = JSON.parse(options.body as string);
      expect(body.system).toEqual([
        {
          type: 'text',
          text: 'shared system prompt',
          cache_control: { type: 'ephemeral' },
        },
        { type: 'text', text: 'per-user custom prompt' },
      ]);
    });
  });

  describe('conversation cache breakpoints (T2)', () => {
    it('turns a cacheBreakpoint on a user message into cache_control on its text block', async () => {
      vi.mocked(fetch).mockResolvedValue(
        streamResponse('event: message_stop\ndata: {"type":"message_stop"}\n\n') as never,
      );
      const provider = new AnthropicLLMProvider('secret-key');

      await collectStream(
        provider,
        [
          { role: 'user', content: 'earlier', cacheBreakpoint: true },
          { role: 'assistant', content: 'reply' },
          { role: 'user', content: 'now' },
        ],
        [],
      );

      const [, options] = vi.mocked(fetch).mock.calls[0] as [string, RequestInit];
      const body = JSON.parse(options.body as string);
      expect(body.messages).toEqual([
        {
          role: 'user',
          content: [{ type: 'text', text: 'earlier', cache_control: { type: 'ephemeral' } }],
        },
        { role: 'assistant', content: 'reply' },
        { role: 'user', content: 'now' },
      ]);
    });

    it('attaches cache_control to the marked tool result and to an assistant tool_use turn', async () => {
      vi.mocked(fetch).mockResolvedValue(
        streamResponse('event: message_stop\ndata: {"type":"message_stop"}\n\n') as never,
      );
      const provider = new AnthropicLLMProvider('secret-key');

      await collectStream(
        provider,
        [
          {
            role: 'assistant',
            content: '',
            toolCalls: [{ id: 't1', name: 'list_applications', arguments: {} }],
            cacheBreakpoint: true,
          },
          { role: 'tool', content: '{}', toolCallId: 't1', cacheBreakpoint: true },
        ],
        [],
      );

      const [, options] = vi.mocked(fetch).mock.calls[0] as [string, RequestInit];
      const body = JSON.parse(options.body as string);
      expect(body.messages[0].content[0]).toMatchObject({
        type: 'tool_use',
        id: 't1',
        cache_control: { type: 'ephemeral' },
      });
      expect(body.messages[1].content[0]).toMatchObject({
        type: 'tool_result',
        tool_use_id: 't1',
        cache_control: { type: 'ephemeral' },
      });
    });
  });

  describe('completeWithToolsStream (JEF-239)', () => {
    it('throws when the API key is empty', async () => {
      const provider = new AnthropicLLMProvider('');

      await expect(collectStream(provider, [{ role: 'user', content: 'hi' }], [])).rejects.toThrow(
        'Anthropic API key is not set',
      );
      expect(fetch).not.toHaveBeenCalled();
    });

    it('sends stream: true in the request body', async () => {
      vi.mocked(fetch).mockResolvedValue(
        streamResponse('event: message_stop\ndata: {"type":"message_stop"}\n\n') as never,
      );
      const provider = new AnthropicLLMProvider('secret-key');

      await collectStream(provider, [{ role: 'user', content: 'hi' }], []);

      const [, options] = vi.mocked(fetch).mock.calls[0] as [string, RequestInit];
      const body = JSON.parse(options.body as string);
      expect(body.stream).toBe(true);
    });

    it('forwards a caller-supplied signal into the outbound fetch', async () => {
      vi.mocked(fetch).mockImplementation(() => new Promise(() => {}));
      const controller = new AbortController();
      const provider = new AnthropicLLMProvider('secret-key');

      const gen = provider.completeWithToolsStream(
        [{ role: 'user', content: 'hi' }],
        [],
        undefined,
        controller.signal,
      );
      void gen.next();
      await Promise.resolve();

      const [, options] = vi.mocked(fetch).mock.calls[0] as [string, RequestInit];
      expect(options.signal!.aborted).toBe(false);
      controller.abort();
      expect(options.signal!.aborted).toBe(true);
    });

    it('yields a text_delta per content_block_delta and a final done with the joined text', async () => {
      const sse = [
        'event: message_start',
        'data: {"type":"message_start"}',
        '',
        'event: content_block_start',
        'data: {"type":"content_block_start","index":0,"content_block":{"type":"text"}}',
        '',
        'event: ping',
        'data: {"type":"ping"}',
        '',
        'event: content_block_delta',
        'data: {"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"Hello"}}',
        '',
        'event: content_block_delta',
        'data: {"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":" world"}}',
        '',
        'event: content_block_stop',
        'data: {"type":"content_block_stop","index":0}',
        '',
        'event: message_stop',
        'data: {"type":"message_stop"}',
        '',
        '',
      ].join('\n');
      vi.mocked(fetch).mockResolvedValue(streamResponse(sse) as never);
      const provider = new AnthropicLLMProvider('secret-key');

      const events = await collectStream(provider, [{ role: 'user', content: 'hi' }], []);

      expect(events).toEqual([
        { type: 'text_delta', text: 'Hello' },
        { type: 'text_delta', text: ' world' },
        { type: 'done', content: 'Hello world', toolCalls: [], usage: null },
      ]);
    });

    it('parses usage from message_start and message_delta (JEF-250)', async () => {
      const sse = [
        'event: message_start',
        'data: {"type":"message_start","message":{"usage":{"input_tokens":50,"output_tokens":1}}}',
        '',
        'event: content_block_start',
        'data: {"type":"content_block_start","index":0,"content_block":{"type":"text"}}',
        '',
        'event: content_block_delta',
        'data: {"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"hi"}}',
        '',
        'event: content_block_stop',
        'data: {"type":"content_block_stop","index":0}',
        '',
        'event: message_delta',
        'data: {"type":"message_delta","delta":{"stop_reason":"end_turn"},"usage":{"output_tokens":12}}',
        '',
        'event: message_stop',
        'data: {"type":"message_stop"}',
        '',
        '',
      ].join('\n');
      vi.mocked(fetch).mockResolvedValue(streamResponse(sse) as never);
      const provider = new AnthropicLLMProvider('secret-key');

      const events = await collectStream(provider, [{ role: 'user', content: 'hi' }], []);

      expect(events[events.length - 1]).toEqual({
        type: 'done',
        content: 'hi',
        toolCalls: [],
        usage: { promptTokens: 50, completionTokens: 12, cacheReadTokens: 0, cacheWriteTokens: 0 },
      });
      // Reported as soon as message_start arrives, so an aborted stream can
      // still be charged for the prompt the provider already billed (S8).
      expect(events[0]).toEqual({ type: 'prompt_usage', promptTokens: 50 });
    });

    it('completes a stream that runs well past REQUEST_TIMEOUT_MS in total, as long as chunks keep arriving within the idle window (regression)', async () => {
      vi.useFakeTimers();
      try {
        const frames = [
          'event: content_block_start\ndata: {"type":"content_block_start","index":0,"content_block":{"type":"text"}}\n\n',
          'event: content_block_delta\ndata: {"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"a"}}\n\n',
          'event: content_block_delta\ndata: {"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"b"}}\n\n',
          'event: message_stop\ndata: {"type":"message_stop"}\n\n',
        ];
        // Spaced well under LLM.STREAM_IDLE_TIMEOUT_MS apart, but their sum
        // comfortably exceeds LLM.REQUEST_TIMEOUT_MS — the old fixed-duration
        // timeout (tied to the whole fetch, including the body read) would
        // have aborted this mid-stream even though it was actively flowing.
        const gapMs = LLM.STREAM_IDLE_TIMEOUT_MS - 5_000;
        vi.mocked(fetch).mockResolvedValue(delayedStreamResponse(frames, gapMs) as never);
        const provider = new AnthropicLLMProvider('secret-key');

        const events: unknown[] = [];
        const consume = (async () => {
          for await (const event of provider.completeWithToolsStream(
            [{ role: 'user', content: 'hi' }],
            [],
          )) {
            events.push(event);
          }
        })();

        for (let i = 0; i < frames.length; i++) {
          await vi.advanceTimersByTimeAsync(gapMs);
        }
        await consume;

        expect(events).toEqual([
          { type: 'text_delta', text: 'a' },
          { type: 'text_delta', text: 'b' },
          { type: 'done', content: 'ab', toolCalls: [], usage: null },
        ]);
      } finally {
        vi.useRealTimers();
      }
    });

    it('reassembles a streamed tool call from input_json_delta fragments', async () => {
      const sse = [
        'event: content_block_start',
        'data: {"type":"content_block_start","index":0,"content_block":{"type":"tool_use","id":"toolu_1","name":"list_applications"}}',
        '',
        'event: content_block_delta',
        'data: {"type":"content_block_delta","index":0,"delta":{"type":"input_json_delta","partial_json":"{\\"status\\":"}}',
        '',
        'event: content_block_delta',
        'data: {"type":"content_block_delta","index":0,"delta":{"type":"input_json_delta","partial_json":"\\"applied\\"}"}}',
        '',
        'event: content_block_stop',
        'data: {"type":"content_block_stop","index":0}',
        '',
        'event: message_stop',
        'data: {"type":"message_stop"}',
        '',
        '',
      ].join('\n');
      vi.mocked(fetch).mockResolvedValue(streamResponse(sse) as never);
      const provider = new AnthropicLLMProvider('secret-key');

      const events = await collectStream(provider, [{ role: 'user', content: 'hi' }], []);

      expect(events).toEqual([
        {
          type: 'done',
          content: null,
          toolCalls: [
            { id: 'toolu_1', name: 'list_applications', arguments: { status: 'applied' } },
          ],
          usage: null,
        },
      ]);
    });

    it('throws on a stream error event', async () => {
      const sse =
        'event: error\ndata: {"type":"error","error":{"type":"overloaded_error","message":"Overloaded"}}\n\n';
      vi.mocked(fetch).mockResolvedValue(streamResponse(sse) as never);
      const provider = new AnthropicLLMProvider('secret-key');

      await expect(collectStream(provider, [{ role: 'user', content: 'hi' }], [])).rejects.toThrow(
        /Overloaded/,
      );
    });

    it('throws when the response is not ok', async () => {
      vi.mocked(fetch).mockResolvedValue(streamResponse('rate limited', false, 429) as never);
      const provider = new AnthropicLLMProvider('secret-key');

      await expect(collectStream(provider, [{ role: 'user', content: 'hi' }], [])).rejects.toThrow(
        /Anthropic error 429/,
      );
    });
  });
});
