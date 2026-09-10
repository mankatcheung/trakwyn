import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('#/graphql/client', () => ({
  CHAT_STREAM_URL: 'https://api.example.com/chat/stream',
}));

import { streamChatMessage, ChatStreamError } from '#/lib/chatStream';

function streamResponse(sseText: string, ok = true, status = 200) {
  return {
    ok,
    status,
    body: new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new TextEncoder().encode(sseText));
        controller.close();
      },
    }),
  };
}

describe('streamChatMessage', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('posts to CHAT_STREAM_URL with credentials and the conversationId/message body', async () => {
    vi.mocked(fetch).mockResolvedValue(streamResponse('event: done\ndata: {}\n\n') as never);

    await streamChatMessage({ conversationId: 'conv-1', message: 'hi', onDelta: vi.fn() });

    const [url, options] = vi.mocked(fetch).mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://api.example.com/chat/stream');
    expect(options.credentials).toBe('include');
    expect(JSON.parse(options.body as string)).toEqual({ conversationId: 'conv-1', message: 'hi' });
  });

  it('calls onDelta for each delta frame, in order', async () => {
    const sse =
      'event: delta\ndata: {"text":"Hello"}\n\nevent: delta\ndata: {"text":" world"}\n\nevent: done\ndata: {}\n\n';
    vi.mocked(fetch).mockResolvedValue(streamResponse(sse) as never);
    const onDelta = vi.fn();

    await streamChatMessage({ conversationId: 'conv-1', message: 'hi', onDelta });

    expect(onDelta.mock.calls).toEqual([['Hello'], [' world']]);
  });

  it('resolves once it sees a done frame, without requiring the stream to end', async () => {
    vi.mocked(fetch).mockResolvedValue(streamResponse('event: done\ndata: {}\n\n') as never);

    await expect(
      streamChatMessage({ conversationId: 'conv-1', message: 'hi', onDelta: vi.fn() }),
    ).resolves.toBeUndefined();
  });

  it('rejects with a ChatStreamError carrying the domain error code on an error frame', async () => {
    const sse =
      'event: error\ndata: {"code":"AI_NOT_CONFIGURED","message":"Add your AI API key"}\n\n';
    vi.mocked(fetch).mockResolvedValue(streamResponse(sse) as never);

    const promise = streamChatMessage({
      conversationId: 'conv-1',
      message: 'hi',
      onDelta: vi.fn(),
    });

    await expect(promise).rejects.toBeInstanceOf(ChatStreamError);
    await expect(promise).rejects.toMatchObject({
      code: 'AI_NOT_CONFIGURED',
      message: 'Add your AI API key',
    });
  });

  it('surfaces a 400/413 JSON error body as a ChatStreamError the pane can show', async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: false,
      status: 400,
      body: null,
      json: () => Promise.resolve({ error: 'message must be at most 8000 characters' }),
    } as never);

    const err = await streamChatMessage({
      conversationId: 'conv-1',
      message: 'x'.repeat(9000),
      onDelta: vi.fn(),
    }).catch((e) => e);

    expect(err).toBeInstanceOf(ChatStreamError);
    expect(err.code).toBe('VALIDATION');
    expect(err.message).toBe('message must be at most 8000 characters');
  });

  it('throws a plain error when the response is not ok', async () => {
    vi.mocked(fetch).mockResolvedValue(streamResponse('', false, 401) as never);

    await expect(
      streamChatMessage({ conversationId: 'conv-1', message: 'hi', onDelta: vi.fn() }),
    ).rejects.toThrow(/401/);
  });

  it('reassembles a delta frame split across two reads', async () => {
    const encoder = new TextEncoder();
    const stream = new ReadableStream<Uint8Array>({
      pull(controller) {
        controller.enqueue(encoder.encode('event: delta\ndata: {"tex'));
        controller.enqueue(encoder.encode('t":"hi"}\n\nevent: done\ndata: {}\n\n'));
        controller.close();
      },
    });
    vi.mocked(fetch).mockResolvedValue({ ok: true, status: 200, body: stream } as never);
    const onDelta = vi.fn();

    await streamChatMessage({ conversationId: 'conv-1', message: 'hi', onDelta });

    expect(onDelta).toHaveBeenCalledWith('hi');
  });

  it('forwards a caller-supplied signal to fetch', async () => {
    vi.mocked(fetch).mockResolvedValue(streamResponse('event: done\ndata: {}\n\n') as never);
    const controller = new AbortController();

    await streamChatMessage({
      conversationId: 'conv-1',
      message: 'hi',
      onDelta: vi.fn(),
      signal: controller.signal,
    });

    const [, options] = vi.mocked(fetch).mock.calls[0] as [string, RequestInit];
    expect(options.signal).toBe(controller.signal);
  });
});
