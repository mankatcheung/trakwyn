import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { OpenAICompatibleLLMProvider } from '#src/infrastructure/llm/OpenAICompatibleLLMProvider.js';
import { LLM } from '#src/use-cases/constants.js';
import { LlmProviderError, ValidationError } from '#src/use-cases/errors/DomainError.js';
import type { LLMMessage } from '#src/use-cases/ports/ILLMProvider.js';
import { makeOutboundUrlPolicy } from '#src/__tests__/helpers/mocks/infrastructure.js';

const BASE_URL = 'https://api.example.com/v1/chat/completions';
const MODEL = 'example-model';

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

async function collectStream(
  provider: OpenAICompatibleLLMProvider,
  ...args: Parameters<OpenAICompatibleLLMProvider['completeWithToolsStream']>
) {
  const events = [];
  for await (const event of provider.completeWithToolsStream(...args)) events.push(event);
  return events;
}

describe('OpenAICompatibleLLMProvider', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  describe('outbound URL policy', () => {
    it('asks the policy before every call and never fetches when it refuses', async () => {
      const policy = makeOutboundUrlPolicy({
        assertAllowed: vi.fn().mockRejectedValue(new ValidationError('URL host is not allowed')),
      });
      const provider = new OpenAICompatibleLLMProvider('key', 'http://10.0.0.5/v1', MODEL, policy);

      await expect(provider.complete([{ role: 'user', content: 'hi' }])).rejects.toMatchObject({
        code: 'VALIDATION',
      });
      await expect(
        collectStream(provider, [{ role: 'user', content: 'hi' }], []),
      ).rejects.toMatchObject({ code: 'VALIDATION' });
      expect(policy.assertAllowed).toHaveBeenCalledWith('http://10.0.0.5/v1', 'llm-provider');
      expect(fetch).not.toHaveBeenCalled();
    });

    it('proceeds when the policy allows the base URL', async () => {
      vi.mocked(fetch).mockResolvedValue(
        jsonResponse({ choices: [{ message: { content: 'ok' } }] }) as never,
      );
      const policy = makeOutboundUrlPolicy();
      const provider = new OpenAICompatibleLLMProvider('key', BASE_URL, MODEL, policy);

      await provider.complete([{ role: 'user', content: 'hi' }]);

      expect(policy.assertAllowed).toHaveBeenCalledWith(BASE_URL, 'llm-provider');
      expect(fetch).toHaveBeenCalledTimes(1);
    });
  });

  it('turns a non-2xx response into a coded LlmProviderError with a truncated excerpt', async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: false,
      status: 401,
      text: () => Promise.resolve(`<html>${'secret '.repeat(200)}</html>`),
    } as never);
    const provider = new OpenAICompatibleLLMProvider('key', BASE_URL, MODEL);

    const err = await provider.complete([{ role: 'user', content: 'hi' }]).catch((e) => e);

    expect(err).toBeInstanceOf(LlmProviderError);
    expect(err.kind).toBe('auth');
    expect(err.code).toBe('AI_PROVIDER_ERROR');
    expect(err.message.length).toBeLessThan(400);
  });

  it('throws when the API key is empty', async () => {
    const provider = new OpenAICompatibleLLMProvider('', BASE_URL, MODEL);

    await expect(provider.complete([{ role: 'user', content: 'hi' }])).rejects.toThrow(
      'API key is not set',
    );
    expect(fetch).not.toHaveBeenCalled();
  });

  it('posts to the given base URL with a Bearer auth header, model, and messages', async () => {
    vi.mocked(fetch).mockResolvedValue(
      jsonResponse({ choices: [{ message: { content: 'ok' } }] }) as never,
    );

    const provider = new OpenAICompatibleLLMProvider('secret-key', BASE_URL, MODEL);
    const messages: LLMMessage[] = [
      { role: 'system', content: 'be helpful' },
      { role: 'user', content: 'hello' },
    ];
    await provider.complete(messages, 256);

    const [url, options] = vi.mocked(fetch).mock.calls[0] as [string, RequestInit];
    expect(url).toBe(BASE_URL);
    expect((options.headers as Record<string, string>).Authorization).toBe('Bearer secret-key');

    const body = JSON.parse(options.body as string);
    expect(body.model).toBe(MODEL);
    expect(body.messages).toEqual(messages);
    expect(body.max_tokens).toBe(256);
  });

  it('asks for JSON mode only when the caller opts in (F6)', async () => {
    vi.mocked(fetch).mockResolvedValue(
      jsonResponse({ choices: [{ message: { content: '{}' } }] }) as never,
    );
    const provider = new OpenAICompatibleLLMProvider('secret-key', BASE_URL, MODEL);

    await provider.complete([{ role: 'user', content: 'JSON please' }], undefined, undefined, {
      json: true,
    });
    await provider.complete([{ role: 'user', content: 'prose please' }]);

    const bodies = vi
      .mocked(fetch)
      .mock.calls.map(([, o]) => JSON.parse((o as RequestInit).body as string));
    expect(bodies[0].response_format).toEqual({ type: 'json_object' });
    expect(bodies[1].response_format).toBeUndefined();
  });

  it('defaults maxTokens to 512 when not provided', async () => {
    vi.mocked(fetch).mockResolvedValue(
      jsonResponse({ choices: [{ message: { content: 'ok' } }] }) as never,
    );

    const provider = new OpenAICompatibleLLMProvider('secret-key', BASE_URL, MODEL);
    await provider.complete([{ role: 'user', content: 'hi' }]);

    const [, options] = vi.mocked(fetch).mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(options.body as string);
    expect(body.max_tokens).toBe(512);
  });

  it('clamps a maxTokens request above the hard ceiling (JEF-126)', async () => {
    vi.mocked(fetch).mockResolvedValue(
      jsonResponse({ choices: [{ message: { content: 'ok' } }] }) as never,
    );

    const provider = new OpenAICompatibleLLMProvider('secret-key', BASE_URL, MODEL);
    await provider.complete([{ role: 'user', content: 'hi' }], 999_999);

    const [, options] = vi.mocked(fetch).mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(options.body as string);
    expect(body.max_tokens).toBe(LLM.MAX_OUTPUT_TOKENS_CAP);
  });

  it('returns the content of the first choice', async () => {
    vi.mocked(fetch).mockResolvedValue(
      jsonResponse({ choices: [{ message: { content: 'generated response' } }] }) as never,
    );

    const provider = new OpenAICompatibleLLMProvider('secret-key', BASE_URL, MODEL);
    const result = await provider.complete([{ role: 'user', content: 'hi' }]);

    expect(result.content).toBe('generated response');
  });

  it('returns an empty string when choices are missing', async () => {
    vi.mocked(fetch).mockResolvedValue(jsonResponse({ choices: [] }) as never);

    const provider = new OpenAICompatibleLLMProvider('secret-key', BASE_URL, MODEL);
    const result = await provider.complete([{ role: 'user', content: 'hi' }]);

    expect(result.content).toBe('');
  });

  it('returns null usage when the response has no usage field', async () => {
    vi.mocked(fetch).mockResolvedValue(
      jsonResponse({ choices: [{ message: { content: 'ok' } }] }) as never,
    );

    const provider = new OpenAICompatibleLLMProvider('secret-key', BASE_URL, MODEL);
    const result = await provider.complete([{ role: 'user', content: 'hi' }]);

    expect(result.usage).toBeNull();
  });

  it('keeps the cached share of the prompt when the backend reports it (T3)', async () => {
    vi.mocked(fetch).mockResolvedValue(
      jsonResponse({
        choices: [{ message: { content: 'ok' } }],
        usage: {
          prompt_tokens: 80,
          completion_tokens: 20,
          prompt_tokens_details: { cached_tokens: 64 },
        },
      }) as never,
    );

    const provider = new OpenAICompatibleLLMProvider('secret-key', BASE_URL, MODEL);
    const result = await provider.complete([{ role: 'user', content: 'hi' }]);

    expect(result.usage).toEqual({ promptTokens: 80, completionTokens: 20, cacheReadTokens: 64 });
  });

  it('flags a reply the backend cut off at the output budget (F2)', async () => {
    vi.mocked(fetch).mockResolvedValue(
      jsonResponse({
        choices: [{ message: { content: '{"a":' }, finish_reason: 'length' }],
      }) as never,
    );

    const provider = new OpenAICompatibleLLMProvider('secret-key', BASE_URL, MODEL);
    const result = await provider.complete([{ role: 'user', content: 'hi' }]);

    expect(result.truncated).toBe(true);
  });

  it('does not flag a reply that finished normally', async () => {
    vi.mocked(fetch).mockResolvedValue(
      jsonResponse({ choices: [{ message: { content: 'ok' }, finish_reason: 'stop' }] }) as never,
    );

    const provider = new OpenAICompatibleLLMProvider('secret-key', BASE_URL, MODEL);
    const result = await provider.complete([{ role: 'user', content: 'hi' }]);

    expect(result.truncated).toBe(false);
  });

  it('parses usage from the response (JEF-250)', async () => {
    vi.mocked(fetch).mockResolvedValue(
      jsonResponse({
        choices: [{ message: { content: 'ok' } }],
        usage: { prompt_tokens: 80, completion_tokens: 20 },
      }) as never,
    );

    const provider = new OpenAICompatibleLLMProvider('secret-key', BASE_URL, MODEL);
    const result = await provider.complete([{ role: 'user', content: 'hi' }]);

    expect(result.usage).toEqual({ promptTokens: 80, completionTokens: 20 });
  });

  it('throws with the status and body when the response is not ok', async () => {
    vi.mocked(fetch).mockResolvedValue(
      jsonResponse({ error: 'rate limited' }, false, 429) as never,
    );

    const provider = new OpenAICompatibleLLMProvider('secret-key', BASE_URL, MODEL);

    await expect(provider.complete([{ role: 'user', content: 'hi' }])).rejects.toThrow(
      /LLM provider error 429/,
    );
  });

  it('retries a transient 5xx failure and succeeds (JEF-110)', async () => {
    vi.useFakeTimers();
    try {
      vi.mocked(fetch)
        .mockResolvedValueOnce(jsonResponse({ error: 'unavailable' }, false, 503) as never)
        .mockResolvedValueOnce(
          jsonResponse({ choices: [{ message: { content: 'ok after retry' } }] }) as never,
        );

      const provider = new OpenAICompatibleLLMProvider('secret-key', BASE_URL, MODEL);
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

    const provider = new OpenAICompatibleLLMProvider('secret-key', BASE_URL, MODEL);

    await expect(provider.complete([{ role: 'user', content: 'hi' }])).rejects.toThrow(
      /LLM provider error 401/,
    );
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('forwards a caller-supplied signal into the outbound fetch (JEF-240)', async () => {
    vi.mocked(fetch).mockImplementation(() => new Promise(() => {}));
    const controller = new AbortController();
    const provider = new OpenAICompatibleLLMProvider('secret-key', BASE_URL, MODEL);

    void provider.complete([{ role: 'user', content: 'hi' }], undefined, controller.signal);
    await Promise.resolve();

    const [, options] = vi.mocked(fetch).mock.calls[0] as [string, RequestInit];
    expect(options.signal!.aborted).toBe(false);
    controller.abort();
    expect(options.signal!.aborted).toBe(true);
  });

  describe('completeWithToolsStream (JEF-239)', () => {
    it('throws when the API key is empty', async () => {
      const provider = new OpenAICompatibleLLMProvider('', BASE_URL, MODEL);

      await expect(collectStream(provider, [{ role: 'user', content: 'hi' }], [])).rejects.toThrow(
        'API key is not set',
      );
      expect(fetch).not.toHaveBeenCalled();
    });

    it('sends stream: true in the request body', async () => {
      vi.mocked(fetch).mockResolvedValue(streamResponse('data: [DONE]\n\n') as never);
      const provider = new OpenAICompatibleLLMProvider('secret-key', BASE_URL, MODEL);

      await collectStream(provider, [{ role: 'user', content: 'hi' }], []);

      const [, options] = vi.mocked(fetch).mock.calls[0] as [string, RequestInit];
      const body = JSON.parse(options.body as string);
      expect(body.stream).toBe(true);
    });

    it('forwards a caller-supplied signal into the outbound fetch', async () => {
      vi.mocked(fetch).mockImplementation(() => new Promise(() => {}));
      const controller = new AbortController();
      const provider = new OpenAICompatibleLLMProvider('secret-key', BASE_URL, MODEL);

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

    it('yields a text_delta per chunk and a final done with the joined content, stopping at [DONE]', async () => {
      const sse = [
        'data: {"choices":[{"delta":{"role":"assistant","content":"Hello"}}]}',
        '',
        'data: {"choices":[{"delta":{"content":" world"}}]}',
        '',
        'data: {"choices":[{"delta":{},"finish_reason":"stop"}]}',
        '',
        'data: [DONE]',
        '',
        '',
      ].join('\n');
      vi.mocked(fetch).mockResolvedValue(streamResponse(sse) as never);
      const provider = new OpenAICompatibleLLMProvider('secret-key', BASE_URL, MODEL);

      const events = await collectStream(provider, [{ role: 'user', content: 'hi' }], []);

      expect(events).toEqual([
        { type: 'text_delta', text: 'Hello' },
        { type: 'text_delta', text: ' world' },
        { type: 'done', content: 'Hello world', toolCalls: [], usage: null },
      ]);
    });

    it('sends stream_options.include_usage in the request body (JEF-250)', async () => {
      vi.mocked(fetch).mockResolvedValue(streamResponse('data: [DONE]\n\n') as never);
      const provider = new OpenAICompatibleLLMProvider('secret-key', BASE_URL, MODEL);

      await collectStream(provider, [{ role: 'user', content: 'hi' }], []);

      const [, options] = vi.mocked(fetch).mock.calls[0] as [string, RequestInit];
      const body = JSON.parse(options.body as string);
      expect(body.stream_options).toEqual({ include_usage: true });
    });

    it('parses usage from the final, choices-empty chunk (JEF-250)', async () => {
      const sse = [
        'data: {"choices":[{"delta":{"content":"hi"}}]}',
        '',
        'data: {"choices":[],"usage":{"prompt_tokens":30,"completion_tokens":5}}',
        '',
        'data: [DONE]',
        '',
        '',
      ].join('\n');
      vi.mocked(fetch).mockResolvedValue(streamResponse(sse) as never);
      const provider = new OpenAICompatibleLLMProvider('secret-key', BASE_URL, MODEL);

      const events = await collectStream(provider, [{ role: 'user', content: 'hi' }], []);

      expect(events[events.length - 1]).toEqual({
        type: 'done',
        content: 'hi',
        toolCalls: [],
        usage: { promptTokens: 30, completionTokens: 5 },
      });
    });

    it('reassembles a streamed tool call from per-index delta fragments', async () => {
      const sse = [
        'data: {"choices":[{"delta":{"tool_calls":[{"index":0,"id":"call_1","function":{"name":"list_applications","arguments":""}}]}}]}',
        '',
        'data: {"choices":[{"delta":{"tool_calls":[{"index":0,"function":{"arguments":"{\\"status\\":"}}]}}]}',
        '',
        'data: {"choices":[{"delta":{"tool_calls":[{"index":0,"function":{"arguments":"\\"applied\\"}"}}]}}]}',
        '',
        'data: {"choices":[{"delta":{},"finish_reason":"tool_calls"}]}',
        '',
        'data: [DONE]',
        '',
        '',
      ].join('\n');
      vi.mocked(fetch).mockResolvedValue(streamResponse(sse) as never);
      const provider = new OpenAICompatibleLLMProvider('secret-key', BASE_URL, MODEL);

      const events = await collectStream(provider, [{ role: 'user', content: 'hi' }], []);

      expect(events).toEqual([
        {
          type: 'done',
          content: null,
          toolCalls: [
            { id: 'call_1', name: 'list_applications', arguments: { status: 'applied' } },
          ],
          usage: null,
        },
      ]);
    });

    it('throws when the response is not ok', async () => {
      vi.mocked(fetch).mockResolvedValue(streamResponse('rate limited', false, 429) as never);
      const provider = new OpenAICompatibleLLMProvider('secret-key', BASE_URL, MODEL);

      await expect(collectStream(provider, [{ role: 'user', content: 'hi' }], [])).rejects.toThrow(
        /LLM provider error 429/,
      );
    });
  });
});
