import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { GoogleAILLMProvider } from '#src/infrastructure/llm/GoogleAILLMProvider.js';
import { LLM } from '#src/use-cases/constants.js';
import type { LLMMessage } from '#src/use-cases/ports/ILLMProvider.js';

const jsonResponse = (body: unknown, ok = true, status = 200) => ({
  ok,
  status,
  json: () => Promise.resolve(body),
  text: () => Promise.resolve(JSON.stringify(body)),
});

/** Frames each chunk the way `streamGenerateContent?alt=sse` does (F8). */
const sseResponse = (...chunks: unknown[]) => {
  const sse = chunks.map((c) => `data: ${JSON.stringify(c)}\n\n`).join('');
  return {
    ok: true,
    status: 200,
    body: new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new TextEncoder().encode(sse));
        controller.close();
      },
    }),
    text: () => Promise.resolve(sse),
  };
};

async function collectStream(
  provider: GoogleAILLMProvider,
  ...args: Parameters<GoogleAILLMProvider['completeWithToolsStream']>
) {
  const events = [];
  for await (const event of provider.completeWithToolsStream(...args)) events.push(event);
  return events;
}

describe('GoogleAILLMProvider', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  describe('constructor', () => {
    it('uses a given base URL and extra headers instead of the default endpoint (JEF-446)', async () => {
      vi.mocked(fetch).mockResolvedValue(
        jsonResponse({ candidates: [{ content: { parts: [{ text: 'ok' }] } }] }) as never,
      );

      const provider = new GoogleAILLMProvider(
        'test-key',
        'gemini-custom',
        'https://gateway.example/google-ai-studio/v1beta/models',
        { 'cf-aig-authorization': 'Bearer t' },
      );
      await provider.complete([{ role: 'user', content: 'hi' }]);

      const [url, init] = vi.mocked(fetch).mock.calls[0] as [string, RequestInit];
      expect(url).toBe(
        'https://gateway.example/google-ai-studio/v1beta/models/gemini-custom:generateContent',
      );
      expect(init.headers).toMatchObject({
        'cf-aig-authorization': 'Bearer t',
        'x-goog-api-key': 'test-key',
      });
    });

    it('falls back to the default model when none is given', async () => {
      vi.mocked(fetch).mockResolvedValue(
        jsonResponse({ candidates: [{ content: { parts: [{ text: 'ok' }] } }] }) as never,
      );

      const provider = new GoogleAILLMProvider('test-key');
      await provider.complete([{ role: 'user', content: 'hi' }]);

      const [url] = vi.mocked(fetch).mock.calls[0] as [string];
      expect(url).toContain(`/${LLM.GOOGLEAI_DEFAULT_MODEL}:generateContent`);
    });

    it('uses the given model when provided', async () => {
      vi.mocked(fetch).mockResolvedValue(
        jsonResponse({ candidates: [{ content: { parts: [{ text: 'ok' }] } }] }) as never,
      );

      const provider = new GoogleAILLMProvider('test-key', 'gemini-custom');
      await provider.complete([{ role: 'user', content: 'hi' }]);

      const [url] = vi.mocked(fetch).mock.calls[0] as [string];
      expect(url).toContain('/gemini-custom:generateContent');
    });
  });

  describe('complete', () => {
    it('throws when the API key is empty', async () => {
      const provider = new GoogleAILLMProvider('');

      await expect(provider.complete([{ role: 'user', content: 'hi' }])).rejects.toThrow(
        'Google AI API key is not set',
      );
      expect(fetch).not.toHaveBeenCalled();
    });

    it('sends the API key as a header, never in the URL, and the messages as contents', async () => {
      vi.mocked(fetch).mockResolvedValue(
        jsonResponse({ candidates: [{ content: { parts: [{ text: 'ok' }] } }] }) as never,
      );

      const provider = new GoogleAILLMProvider('secret-key');
      const messages: LLMMessage[] = [
        { role: 'system', content: 'be helpful' },
        { role: 'user', content: 'hello' },
        { role: 'assistant', content: 'hi there' },
      ];
      await provider.complete(messages, 256);

      const [url, options] = vi.mocked(fetch).mock.calls[0] as [string, RequestInit];
      // Outbound fetch spans and proxy logs record the URL verbatim, so the
      // secret must not be part of it.
      expect(url).not.toContain('secret-key');
      expect((options.headers as Record<string, string>)['x-goog-api-key']).toBe('secret-key');
      expect(options.method).toBe('POST');

      const body = JSON.parse(options.body as string);
      expect(body.generationConfig).toEqual({ maxOutputTokens: 256 });
      // `contents[].role` is user|model only — a `system` role is a 400 from
      // Gemini (F1). System text goes in the top-level systemInstruction.
      expect(body.systemInstruction).toEqual({ parts: [{ text: 'be helpful' }] });
      expect(body.contents).toEqual([
        { role: 'user', parts: [{ text: 'hello' }] },
        { role: 'model', parts: [{ text: 'hi there' }] },
      ]);
    });

    it('omits systemInstruction when there is no system message', async () => {
      vi.mocked(fetch).mockResolvedValue(
        jsonResponse({ candidates: [{ content: { parts: [{ text: 'ok' }] } }] }) as never,
      );

      const provider = new GoogleAILLMProvider('secret-key');
      await provider.complete([{ role: 'user', content: 'hello' }]);

      const [, options] = vi.mocked(fetch).mock.calls[0] as [string, RequestInit];
      const body = JSON.parse(options.body as string);
      expect(body.systemInstruction).toBeUndefined();
      expect(body.contents).toEqual([{ role: 'user', parts: [{ text: 'hello' }] }]);
    });

    it('asks for a JSON reply only when the caller opts in (F6)', async () => {
      vi.mocked(fetch).mockResolvedValue(
        jsonResponse({ candidates: [{ content: { parts: [{ text: '{}' }] } }] }) as never,
      );
      const provider = new GoogleAILLMProvider('test-key');

      await provider.complete([{ role: 'user', content: 'JSON' }], undefined, undefined, {
        json: true,
      });
      await provider.complete([{ role: 'user', content: 'prose' }]);

      const bodies = vi
        .mocked(fetch)
        .mock.calls.map(([, o]) => JSON.parse((o as RequestInit).body as string));
      expect(bodies[0].generationConfig.responseMimeType).toBe('application/json');
      expect(bodies[1].generationConfig.responseMimeType).toBeUndefined();
    });

    it('defaults maxTokens to 512 when not provided', async () => {
      vi.mocked(fetch).mockResolvedValue(
        jsonResponse({ candidates: [{ content: { parts: [{ text: 'ok' }] } }] }) as never,
      );

      const provider = new GoogleAILLMProvider('secret-key');
      await provider.complete([{ role: 'user', content: 'hi' }]);

      const [, options] = vi.mocked(fetch).mock.calls[0] as [string, RequestInit];
      const body = JSON.parse(options.body as string);
      expect(body.generationConfig).toEqual({ maxOutputTokens: 512 });
    });

    it('clamps a maxTokens request above the hard ceiling (JEF-126)', async () => {
      vi.mocked(fetch).mockResolvedValue(
        jsonResponse({ candidates: [{ content: { parts: [{ text: 'ok' }] } }] }) as never,
      );

      const provider = new GoogleAILLMProvider('secret-key');
      await provider.complete([{ role: 'user', content: 'hi' }], 999_999);

      const [, options] = vi.mocked(fetch).mock.calls[0] as [string, RequestInit];
      const body = JSON.parse(options.body as string);
      expect(body.generationConfig).toEqual({ maxOutputTokens: LLM.MAX_OUTPUT_TOKENS_CAP });
    });

    it('returns the text from the first candidate', async () => {
      vi.mocked(fetch).mockResolvedValue(
        jsonResponse({
          candidates: [{ content: { parts: [{ text: 'generated response' }] } }],
        }) as never,
      );

      const provider = new GoogleAILLMProvider('secret-key');
      const result = await provider.complete([{ role: 'user', content: 'hi' }]);

      expect(result.content).toBe('generated response');
    });

    it('returns an empty string when candidates are missing', async () => {
      vi.mocked(fetch).mockResolvedValue(jsonResponse({}) as never);

      const provider = new GoogleAILLMProvider('secret-key');
      const result = await provider.complete([{ role: 'user', content: 'hi' }]);

      expect(result.content).toBe('');
    });

    it('flags a reply cut off by MAX_TOKENS (F2)', async () => {
      vi.mocked(fetch).mockResolvedValue(
        jsonResponse({
          candidates: [{ content: { parts: [{ text: '{"a":' }] }, finishReason: 'MAX_TOKENS' }],
        }) as never,
      );

      const provider = new GoogleAILLMProvider('test-key');
      const result = await provider.complete([{ role: 'user', content: 'hi' }]);

      expect(result.truncated).toBe(true);
    });

    it('returns null usage when the response has no usageMetadata field', async () => {
      vi.mocked(fetch).mockResolvedValue(
        jsonResponse({ candidates: [{ content: { parts: [{ text: 'ok' }] } }] }) as never,
      );

      const provider = new GoogleAILLMProvider('secret-key');
      const result = await provider.complete([{ role: 'user', content: 'hi' }]);

      expect(result.usage).toBeNull();
    });

    it('keeps the cached share of the prompt when Gemini reports it (T3)', async () => {
      vi.mocked(fetch).mockResolvedValue(
        jsonResponse({
          candidates: [{ content: { parts: [{ text: 'ok' }] } }],
          usageMetadata: {
            promptTokenCount: 60,
            candidatesTokenCount: 15,
            cachedContentTokenCount: 40,
          },
        }) as never,
      );

      const provider = new GoogleAILLMProvider('test-key');
      const result = await provider.complete([{ role: 'user', content: 'hi' }]);

      expect(result.usage).toEqual({ promptTokens: 60, completionTokens: 15, cacheReadTokens: 40 });
    });

    it('parses usage from usageMetadata (JEF-250)', async () => {
      vi.mocked(fetch).mockResolvedValue(
        jsonResponse({
          candidates: [{ content: { parts: [{ text: 'ok' }] } }],
          usageMetadata: { promptTokenCount: 60, candidatesTokenCount: 15 },
        }) as never,
      );

      const provider = new GoogleAILLMProvider('secret-key');
      const result = await provider.complete([{ role: 'user', content: 'hi' }]);

      expect(result.usage).toEqual({ promptTokens: 60, completionTokens: 15 });
    });

    it('throws with the status and body when the response is not ok', async () => {
      vi.mocked(fetch).mockResolvedValue(
        jsonResponse({ error: 'quota exceeded' }, false, 429) as never,
      );

      const provider = new GoogleAILLMProvider('secret-key');

      await expect(provider.complete([{ role: 'user', content: 'hi' }])).rejects.toThrow(
        /Google AI error 429/,
      );
    });

    it('retries a transient 5xx failure and succeeds (JEF-110)', async () => {
      vi.useFakeTimers();
      try {
        vi.mocked(fetch)
          .mockResolvedValueOnce(jsonResponse({ error: 'unavailable' }, false, 503) as never)
          .mockResolvedValueOnce(
            jsonResponse({
              candidates: [{ content: { parts: [{ text: 'ok after retry' }] } }],
            }) as never,
          );

        const provider = new GoogleAILLMProvider('secret-key');
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

      const provider = new GoogleAILLMProvider('secret-key');

      await expect(provider.complete([{ role: 'user', content: 'hi' }])).rejects.toThrow(
        /Google AI error 401/,
      );
      expect(fetch).toHaveBeenCalledTimes(1);
    });

    it('forwards a caller-supplied signal into the outbound fetch (JEF-240)', async () => {
      vi.mocked(fetch).mockImplementation(() => new Promise(() => {}));
      const controller = new AbortController();
      const provider = new GoogleAILLMProvider('secret-key');

      void provider.complete([{ role: 'user', content: 'hi' }], undefined, controller.signal);
      await Promise.resolve();

      const [, options] = vi.mocked(fetch).mock.calls[0] as [string, RequestInit];
      expect(options.signal!.aborted).toBe(false);
      controller.abort();
      expect(options.signal!.aborted).toBe(true);
    });
  });

  // Exercises the private completeWithTools (Gemini's non-streaming
  // implementation of the streaming port method — see completeWithToolsStream's
  // doc comment) through the public completeWithToolsStream, since JEF-245
  // removed completeWithTools from ILLMProvider and this class no longer
  // exposes it directly.
  describe('completeWithToolsStream tool-calling request/response shape', () => {
    const TOOLS = [
      {
        name: 'list_applications',
        description: 'List applications',
        parameters: { type: 'object' },
      },
    ];

    it('clamps a maxTokens request above the hard ceiling (JEF-126)', async () => {
      vi.mocked(fetch).mockResolvedValue(
        sseResponse({ candidates: [{ content: { parts: [{ text: 'ok' }] } }] }) as never,
      );

      const provider = new GoogleAILLMProvider('secret-key');
      await collectStream(provider, [{ role: 'user', content: 'hi' }], TOOLS, 999_999);

      const [, options] = vi.mocked(fetch).mock.calls[0] as [string, RequestInit];
      const body = JSON.parse(options.body as string);
      expect(body.generationConfig).toEqual({ maxOutputTokens: LLM.MAX_OUTPUT_TOKENS_CAP });
    });

    it('sends tool definitions in the Gemini functionDeclarations shape', async () => {
      vi.mocked(fetch).mockResolvedValue(
        sseResponse({ candidates: [{ content: { parts: [{ text: 'ok' }] } }] }) as never,
      );

      const provider = new GoogleAILLMProvider('secret-key');
      await collectStream(provider, [{ role: 'user', content: 'hi' }], TOOLS);

      const [, options] = vi.mocked(fetch).mock.calls[0] as [string, RequestInit];
      const body = JSON.parse(options.body as string);
      expect(body.tools).toEqual([
        {
          functionDeclarations: [
            {
              name: 'list_applications',
              description: 'List applications',
              parameters: { type: 'object' },
            },
          ],
        },
      ]);
    });

    it('moves the system message to a top-level systemInstruction field', async () => {
      vi.mocked(fetch).mockResolvedValue(
        sseResponse({ candidates: [{ content: { parts: [{ text: 'ok' }] } }] }) as never,
      );

      const provider = new GoogleAILLMProvider('secret-key');
      await collectStream(
        provider,
        [
          { role: 'system', content: 'be helpful' },
          { role: 'user', content: 'hello' },
        ],
        TOOLS,
      );

      const [, options] = vi.mocked(fetch).mock.calls[0] as [string, RequestInit];
      const body = JSON.parse(options.body as string);
      expect(body.systemInstruction).toEqual({ parts: [{ text: 'be helpful' }] });
      expect(body.contents).toEqual([{ role: 'user', parts: [{ text: 'hello' }] }]);
    });

    it('parses a functionCall part from the response', async () => {
      vi.mocked(fetch).mockResolvedValue(
        sseResponse({
          candidates: [
            {
              content: {
                parts: [
                  { functionCall: { name: 'list_applications', args: { status: 'applied' } } },
                ],
              },
            },
          ],
        }) as never,
      );

      const provider = new GoogleAILLMProvider('secret-key');
      const events = await collectStream(provider, [{ role: 'user', content: 'hi' }], TOOLS);

      expect(events).toEqual([
        {
          type: 'done',
          content: null,
          toolCalls: [
            {
              id: 'list_applications-0',
              name: 'list_applications',
              arguments: { status: 'applied' },
            },
          ],
          usage: null,
        },
      ]);
    });

    it('returns an empty toolCalls array when the response has only text', async () => {
      vi.mocked(fetch).mockResolvedValue(
        sseResponse({ candidates: [{ content: { parts: [{ text: 'plain answer' }] } }] }) as never,
      );

      const provider = new GoogleAILLMProvider('secret-key');
      const events = await collectStream(provider, [{ role: 'user', content: 'hi' }], TOOLS);

      expect(events).toEqual([
        { type: 'text_delta', text: 'plain answer' },
        { type: 'done', content: 'plain answer', toolCalls: [], usage: null },
      ]);
    });

    it('serializes an assistant tool-call request as a model functionCall part and a tool result by function name', async () => {
      vi.mocked(fetch).mockResolvedValue(
        sseResponse({ candidates: [{ content: { parts: [{ text: 'done' }] } }] }) as never,
      );

      const provider = new GoogleAILLMProvider('secret-key');
      const messages: LLMMessage[] = [
        { role: 'user', content: 'which apps need follow up?' },
        {
          role: 'assistant',
          content: '',
          toolCalls: [
            {
              id: 'list_applications-0',
              name: 'list_applications',
              arguments: { status: 'applied' },
            },
          ],
        },
        { role: 'tool', content: '[]', toolCallId: 'list_applications-0' },
      ];
      await collectStream(provider, messages, TOOLS);

      const [, options] = vi.mocked(fetch).mock.calls[0] as [string, RequestInit];
      const body = JSON.parse(options.body as string);
      expect(body.contents[1]).toEqual({
        role: 'model',
        parts: [{ functionCall: { name: 'list_applications', args: { status: 'applied' } } }],
      });
      expect(body.contents[2]).toEqual({
        role: 'function',
        parts: [{ functionResponse: { name: 'list_applications', response: { content: '[]' } } }],
      });
    });
  });

  describe('completeWithToolsStream (F8 — real streaming)', () => {
    it('posts to streamGenerateContent with alt=sse and yields a text_delta per chunk, then done', async () => {
      vi.mocked(fetch).mockResolvedValue(
        sseResponse(
          { candidates: [{ content: { parts: [{ text: 'Hel' }] } }] },
          { candidates: [{ content: { parts: [{ text: 'lo' }] } }] },
          {
            candidates: [{ content: { parts: [] }, finishReason: 'STOP' }],
            usageMetadata: { promptTokenCount: 12, candidatesTokenCount: 3 },
          },
        ) as never,
      );
      const provider = new GoogleAILLMProvider('secret-key');

      const events = await collectStream(provider, [{ role: 'user', content: 'hi' }], []);

      const [url] = vi.mocked(fetch).mock.calls[0] as [string];
      expect(url).toContain(':streamGenerateContent?alt=sse');
      expect(url).not.toContain('secret-key');
      expect(events).toEqual([
        { type: 'text_delta', text: 'Hel' },
        { type: 'text_delta', text: 'lo' },
        {
          type: 'done',
          content: 'Hello',
          toolCalls: [],
          usage: { promptTokens: 12, completionTokens: 3 },
        },
      ]);
    });

    it('collects a functionCall part that arrives mid-stream', async () => {
      vi.mocked(fetch).mockResolvedValue(
        sseResponse(
          { candidates: [{ content: { parts: [{ text: 'Checking…' }] } }] },
          {
            candidates: [
              { content: { parts: [{ functionCall: { name: 'list_skills', args: {} } }] } },
            ],
          },
        ) as never,
      );
      const provider = new GoogleAILLMProvider('secret-key');

      const events = await collectStream(provider, [{ role: 'user', content: 'hi' }], []);

      expect(events[events.length - 1]).toEqual({
        type: 'done',
        content: 'Checking…',
        toolCalls: [{ id: 'list_skills-0', name: 'list_skills', arguments: {} }],
        usage: null,
      });
    });

    it('throws a coded provider error on a non-2xx response', async () => {
      vi.mocked(fetch).mockResolvedValue({
        ok: false,
        status: 429,
        text: () => Promise.resolve('{"error":"quota"}'),
      } as never);
      const provider = new GoogleAILLMProvider('secret-key');

      await expect(collectStream(provider, [{ role: 'user', content: 'hi' }], [])).rejects.toThrow(
        /Google AI error 429/,
      );
    });

    it('forwards a caller-supplied signal into the outbound fetch', async () => {
      vi.mocked(fetch).mockImplementation(() => new Promise(() => {}));
      const controller = new AbortController();
      const provider = new GoogleAILLMProvider('secret-key');

      void provider
        .completeWithToolsStream(
          [{ role: 'user', content: 'hi' }],
          [],
          undefined,
          controller.signal,
        )
        .next();
      await Promise.resolve();

      const [, options] = vi.mocked(fetch).mock.calls[0] as [string, RequestInit];
      expect(options.signal!.aborted).toBe(false);
      controller.abort();
      expect(options.signal!.aborted).toBe(true);
    });
  });

  describe('reasoning (JEF-445)', () => {
    const okResponse = () =>
      jsonResponse({ candidates: [{ content: { parts: [{ text: 'ok' }] } }] }) as never;
    const generationConfig = () =>
      JSON.parse((vi.mocked(fetch).mock.calls[0][1] as RequestInit).body as string)
        .generationConfig;
    const msgs: LLMMessage[] = [{ role: 'user', content: 'hi' }];

    it.each([
      ['gemini-2.5-flash', 'off', 0],
      ['gemini-2.5-flash-lite', 'off', 0],
      ['gemini-2.5-pro', 'off', 128],
      ['gemini-2.5-flash', 'low', 1024],
    ] as const)('sends the %s thinking budget for %s', async (model, reasoning, budget) => {
      vi.mocked(fetch).mockResolvedValue(okResponse());
      await new GoogleAILLMProvider('k', model).complete(msgs, undefined, undefined, {
        reasoning,
      });
      expect(generationConfig()).toEqual({
        maxOutputTokens: LLM.DEFAULT_MAX_TOKENS,
        thinkingConfig: { thinkingBudget: budget },
      });
    });

    it('sends no thinkingConfig for default, unset, or a model it cannot configure', async () => {
      vi.mocked(fetch).mockResolvedValue(okResponse());
      const flash = new GoogleAILLMProvider('k', 'gemini-2.5-flash');
      await flash.complete(msgs, undefined, undefined, { reasoning: 'default' });
      await flash.complete(msgs);
      await new GoogleAILLMProvider('k', 'gemini-2.0-flash').complete(msgs, undefined, undefined, {
        reasoning: 'off',
      });
      for (const [, init] of vi.mocked(fetch).mock.calls) {
        expect(JSON.parse((init as RequestInit).body as string).generationConfig).toEqual({
          maxOutputTokens: LLM.DEFAULT_MAX_TOKENS,
        });
      }
    });

    it('sends the budget on the streaming path too', async () => {
      vi.mocked(fetch).mockResolvedValue(
        sseResponse({ candidates: [{ content: { parts: [{ text: 'hi' }] } }] }) as never,
      );
      await collectStream(
        new GoogleAILLMProvider('k', 'gemini-2.5-flash'),
        msgs,
        [],
        undefined,
        undefined,
        {
          reasoning: 'off',
        },
      );
      expect(generationConfig().thinkingConfig).toEqual({ thinkingBudget: 0 });
    });

    it('reads thoughtsTokenCount into reasoningTokens', async () => {
      vi.mocked(fetch).mockResolvedValue(
        jsonResponse({
          candidates: [{ content: { parts: [{ text: 'ok' }] } }],
          usageMetadata: { promptTokenCount: 10, candidatesTokenCount: 5, thoughtsTokenCount: 300 },
        }) as never,
      );
      const result = await new GoogleAILLMProvider('k').complete(msgs);
      expect(result.usage).toEqual({ promptTokens: 10, completionTokens: 5, reasoningTokens: 300 });
    });

    it('does not report a truncated resume when thinking is off (regression)', async () => {
      // With thinking on, Flash spent the whole budget on thoughts and stopped
      // with MAX_TOKENS before any text; with it off the reply arrives whole.
      vi.mocked(fetch).mockResolvedValue(
        jsonResponse({
          candidates: [{ content: { parts: [{ text: '{"ok":true}' }] }, finishReason: 'STOP' }],
          usageMetadata: { promptTokenCount: 10, candidatesTokenCount: 6, thoughtsTokenCount: 0 },
        }) as never,
      );
      const result = await new GoogleAILLMProvider('k', 'gemini-2.5-flash').complete(
        msgs,
        2048,
        undefined,
        { json: true, reasoning: 'off' },
      );
      expect(generationConfig().thinkingConfig).toEqual({ thinkingBudget: 0 });
      expect(result.truncated).toBe(false);
      expect(result.usage?.reasoningTokens).toBe(0);
    });
  });
});
