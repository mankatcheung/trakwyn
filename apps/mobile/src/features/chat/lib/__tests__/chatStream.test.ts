// The mock fn is created fresh inside the factory (not referenced from an
// outer `const`) — ES module imports are hoisted above regular statements,
// so a factory that instead closed over an outer variable would run before
// that variable was assigned. `mockFetch` below is captured via the import
// itself, which by then correctly points at the mocked default export.
jest.mock('../expoFetch', () => ({ __esModule: true, default: jest.fn() }));
jest.mock('../../../../graphql/client', () => ({
  getValidAccessToken: jest.fn(async () => 'token-123'),
  recoverFromUnauthorized: jest.fn(),
}));
jest.mock('../../../../lib/userAgent', () => ({
  buildUserAgent: () => 'TrakwynMobile/test (Test; TestOS 1)',
}));

import { ChatStreamError, streamChatMessage } from '../chatStream';
import { getValidAccessToken, recoverFromUnauthorized } from '../../../../graphql/client';
import expoFetch from '../expoFetch';

// Cast away expo/fetch's real (large, internal) FetchResponse type — these
// tests only need the ok/status/body.getReader() shape streamChatMessage
// actually reads.
const mockFetch = jest.mocked(expoFetch) as unknown as jest.Mock;
const mockedGetValidAccessToken = jest.mocked(getValidAccessToken);
const mockedRecover = jest.mocked(recoverFromUnauthorized);

function encodedStreamResponse(frames: string[]) {
  const encoder = new TextEncoder();
  let index = 0;
  return {
    ok: true,
    status: 200,
    body: {
      getReader: () => ({
        read: async () => {
          if (index >= frames.length) return { done: true, value: undefined };
          const value = encoder.encode(frames[index]);
          index += 1;
          return { done: false, value };
        },
        releaseLock: jest.fn(),
      }),
    },
  };
}

const unauthorizedResponse = () => ({ ok: false, status: 401, body: null });
const helloStream = () =>
  encodedStreamResponse(['event: delta\ndata: {"text":"hello"}\n\n', 'event: done\ndata: {}\n\n']);

const send = (onDelta: (text: string) => void = () => {}) =>
  streamChatMessage({ conversationId: 'conv-1', message: 'hi', onDelta });

describe('streamChatMessage', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockedGetValidAccessToken.mockResolvedValue('token-123');
  });

  it('attaches a known-good bearer token and the app User-Agent, and delivers delta chunks in order', async () => {
    mockFetch.mockResolvedValueOnce(
      encodedStreamResponse([
        'event: delta\ndata: {"text":"Hel"}\n\n',
        'event: delta\ndata: {"text":"lo"}\n\n',
        'event: done\ndata: {}\n\n',
      ]),
    );

    const deltas: string[] = [];
    await send((text) => deltas.push(text));

    expect(deltas.join('')).toBe('Hello');
    // Refreshed up front: the route's 401 is plain JSON, not a GraphQL error the client can act on.
    expect(mockedGetValidAccessToken).toHaveBeenCalledTimes(1);
    expect(mockFetch).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          authorization: 'Bearer token-123',
          'user-agent': 'TrakwynMobile/test (Test; TestOS 1)',
        }),
        body: JSON.stringify({ conversationId: 'conv-1', message: 'hi' }),
      }),
    );
  });

  it('calls onFallback when the server reports a fallback frame', async () => {
    mockFetch.mockResolvedValueOnce(
      encodedStreamResponse([
        'event: fallback\ndata: {"from":"openai","to":"anthropic"}\n\n',
        'event: delta\ndata: {"text":"hi"}\n\n',
        'event: done\ndata: {}\n\n',
      ]),
    );

    const onFallback = jest.fn();
    await streamChatMessage({
      conversationId: 'conv-1',
      message: 'hi',
      onDelta: () => {},
      onFallback,
    });

    expect(onFallback).toHaveBeenCalledWith({ from: 'openai', to: 'anthropic' });
  });

  it('rejects with a ChatStreamError carrying the server error code', async () => {
    mockFetch.mockResolvedValueOnce(
      encodedStreamResponse([
        'event: error\ndata: {"code":"AI_NOT_CONFIGURED","message":"No key configured"}\n\n',
      ]),
    );

    await expect(send()).rejects.toThrow(ChatStreamError);
  });

  it('surfaces a 400 JSON error body as a ChatStreamError the screen can show', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 400,
      body: null,
      json: () => Promise.resolve({ error: 'message must be at most 8000 characters' }),
    });

    const err = await send().catch((e) => e);

    expect(err).toBeInstanceOf(ChatStreamError);
    expect(err.code).toBe('VALIDATION');
    expect(err.message).toBe('message must be at most 8000 characters');
  });

  it('throws a plain error on a non-2xx response', async () => {
    mockFetch.mockResolvedValueOnce({ ok: false, status: 500, body: null });

    await expect(send()).rejects.toThrow('status 500');
    expect(mockedRecover).not.toHaveBeenCalled();
  });

  describe('on a 401', () => {
    it('recovers by refreshing and retrying once with the new token', async () => {
      mockFetch.mockResolvedValueOnce(unauthorizedResponse()).mockResolvedValueOnce(helloStream());
      mockedRecover.mockResolvedValueOnce({ kind: 'retry', token: 'fresh-token' });

      const deltas: string[] = [];
      await send((text) => deltas.push(text));

      expect(deltas.join('')).toBe('hello');
      expect(mockedRecover).toHaveBeenCalledWith('token-123');
      expect(mockFetch).toHaveBeenCalledTimes(2);
      expect(mockFetch).toHaveBeenLastCalledWith(
        expect.any(String),
        expect.objectContaining({
          headers: expect.objectContaining({ authorization: 'Bearer fresh-token' }),
        }),
      );
    });

    it('reports an expired session, with a real message, when recovery ends it', async () => {
      mockFetch.mockResolvedValueOnce(unauthorizedResponse());
      mockedRecover.mockResolvedValueOnce({ kind: 'ended' });

      await expect(send()).rejects.toMatchObject({
        name: 'ChatStreamError',
        code: 'UNAUTHORIZED',
        message: 'Your session has expired. Sign in again to continue.',
      });
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    it('reports a connectivity problem when the refresh cannot reach the server', async () => {
      mockFetch.mockResolvedValueOnce(unauthorizedResponse());
      mockedRecover.mockResolvedValueOnce({ kind: 'unreachable' });

      await expect(send()).rejects.toMatchObject({
        name: 'ChatStreamError',
        code: 'NETWORK_ERROR',
      });
    });

    it('reports an expired session when the retry is refused as well', async () => {
      mockFetch
        .mockResolvedValueOnce(unauthorizedResponse())
        .mockResolvedValueOnce(unauthorizedResponse());
      mockedRecover.mockResolvedValueOnce({ kind: 'retry', token: 'fresh-token' });

      await expect(send()).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });

    it('does not attempt recovery when no token was sent to begin with', async () => {
      mockedGetValidAccessToken.mockResolvedValueOnce(null);
      mockFetch.mockResolvedValueOnce(unauthorizedResponse());

      await expect(send()).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
      expect(mockedRecover).not.toHaveBeenCalled();
    });
  });
});
