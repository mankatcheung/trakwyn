import { describe, it, expect, beforeAll, afterAll, vi, afterEach } from 'vitest';
import { randomUUID } from 'node:crypto';
import { CHAT_STREAM, ROUTES } from '#src/http/constants.js';
import { CHAT } from '#src/use-cases/constants.js';
import { buildTestApp, type TestApp } from './helpers/buildTestApp.js';

const REGISTER_MUTATION = `
  mutation Register($email: String!, $password: String!) {
    register(email: $email, password: $password)
  }
`;

const SAVE_LLM_API_KEY_MUTATION = `
  mutation SaveLlmApiKey($provider: String!, $apiKey: String!) {
    saveLlmApiKey(provider: $provider, apiKey: $apiKey)
  }
`;

const CREATE_CONVERSATION_MUTATION = `
  mutation CreateConversation($provider: String) {
    createConversation(provider: $provider) { id }
  }
`;

const CHAT_HISTORY_QUERY = `
  query ChatHistory($conversationId: ID!) {
    chatHistory(conversationId: $conversationId) { role content }
  }
`;

interface GraphQLResponse<T> {
  data: T | null;
  errors?: Array<{ message: string; extensions?: { code?: string } }>;
}

/**
 * Parses the raw SSE response body `.inject()` captured into `{event, data}`
 * frames — a small dedicated parser rather than reusing `parseSSE`
 * (`infrastructure/llm/sseParser.ts`), since that one consumes a
 * `ReadableStream` for the *provider* wire format and this is a plain string
 * of the app's *own* SSE frames already fully buffered by `.inject()`.
 */
function parseFrames(body: string): Array<{ event: string; data: unknown }> {
  return body
    .split('\n\n')
    .filter(Boolean)
    .map((raw) => {
      const eventLine = raw.split('\n').find((l) => l.startsWith('event:'))!;
      const dataLine = raw.split('\n').find((l) => l.startsWith('data:'))!;
      return { event: eventLine.slice(6).trim(), data: JSON.parse(dataLine.slice(5).trim()) };
    });
}

function fakeOpenAIStream(chunks: string[]): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  const frames = chunks
    .map((c) => `data: {"choices":[{"delta":{"content":${JSON.stringify(c)}}}]}\n\n`)
    .join('');
  const sse = `${frames}data: {"choices":[{"delta":{},"finish_reason":"stop"}]}\n\ndata: [DONE]\n\n`;
  return new ReadableStream({
    start(controller) {
      controller.enqueue(encoder.encode(sse));
      controller.close();
    },
  });
}

describe('chat stream integration (JEF-239)', () => {
  let testApp: TestApp;

  async function registerAndGetCookie(): Promise<string> {
    const email = `${randomUUID()}@example.com`;
    const res = await testApp.app.inject({
      method: 'POST',
      url: '/graphql',
      payload: { query: REGISTER_MUTATION, variables: { email, password: 'correct-horse-1' } },
    });
    const cookies = res.cookies as Array<{ name: string; value: string }>;
    return cookies.find((c) => c.name === 'trakwyn_access_token')!.value;
  }

  const authedGraphQL = (token: string, query: string, variables?: Record<string, unknown>) =>
    testApp.app.inject({
      method: 'POST',
      url: '/graphql',
      cookies: { trakwyn_access_token: token },
      payload: { query, variables },
    });

  function streamInject(
    token: string | null,
    body: Record<string, unknown>,
    headers?: Record<string, string>,
  ) {
    return testApp.app.inject({
      method: 'POST',
      url: ROUTES.CHAT_STREAM,
      cookies: token ? { trakwyn_access_token: token } : undefined,
      headers,
      payload: body,
    });
  }

  beforeAll(async () => {
    testApp = await buildTestApp();
  }, 30_000);

  afterAll(async () => {
    await testApp.cleanup();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('returns 401 without a valid access-token cookie', async () => {
    const res = await streamInject(null, { conversationId: 'x', message: 'hi' });

    expect(res.statusCode).toBe(401);
  });

  it('returns 400 when conversationId or message is missing', async () => {
    const token = await registerAndGetCookie();

    const res = await streamInject(token, { message: 'hi' });

    expect(res.statusCode).toBe(400);
  });

  it('returns 400 for a message over CHAT.MAX_MESSAGE_CHARS without opening a stream', async () => {
    const token = await registerAndGetCookie();

    const res = await streamInject(token, {
      conversationId: 'x',
      message: 'x'.repeat(CHAT.MAX_MESSAGE_CHARS + 1),
    });

    expect(res.statusCode).toBe(400);
    expect(res.json()).toEqual({ error: expect.stringContaining('at most') });
  });

  it('returns 413 for a body over the route limit, before parsing it (S10)', async () => {
    const token = await registerAndGetCookie();

    const res = await streamInject(token, {
      conversationId: 'x',
      message: 'x'.repeat(CHAT_STREAM.BODY_LIMIT_BYTES + 1),
    });

    expect(res.statusCode).toBe(413);
  });

  it('streams an error event for a conversation that does not exist', async () => {
    const token = await registerAndGetCookie();

    const res = await streamInject(token, { conversationId: 'nope', message: 'hi' });

    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toContain('text/event-stream');
    const frames = parseFrames(res.body);
    expect(frames).toEqual([
      { event: 'error', data: { code: 'NOT_FOUND', message: expect.any(String) } },
    ]);
  });

  it('streams an error event when the user has no LLM API key configured', async () => {
    const token = await registerAndGetCookie();
    const created = await authedGraphQL(token, CREATE_CONVERSATION_MUTATION);
    const conversationId = (
      created.json() as GraphQLResponse<{ createConversation: { id: string } }>
    ).data!.createConversation.id;

    const res = await streamInject(token, { conversationId, message: 'hi' });

    const frames = parseFrames(res.body);
    expect(frames).toEqual([
      { event: 'error', data: { code: 'AI_NOT_CONFIGURED', message: expect.any(String) } },
    ]);
  });

  it('streams delta events for the reply and persists it, with the outbound provider call faked', async () => {
    const token = await registerAndGetCookie();
    const savedKey = await authedGraphQL(token, SAVE_LLM_API_KEY_MUTATION, {
      provider: 'openai',
      apiKey: 'test-key',
    });
    expect(
      (savedKey.json() as GraphQLResponse<{ saveLlmApiKey: boolean }>).data?.saveLlmApiKey,
    ).toBe(true);
    const created = await authedGraphQL(token, CREATE_CONVERSATION_MUTATION, {
      provider: 'openai',
    });
    const conversationId = (
      created.json() as GraphQLResponse<{ createConversation: { id: string } }>
    ).data!.createConversation.id;

    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        body: fakeOpenAIStream(['Hello', ' there!']),
        text: () => Promise.resolve(''),
      }),
    );

    const res = await streamInject(token, { conversationId, message: 'hi there' });

    expect(res.statusCode).toBe(200);
    const frames = parseFrames(res.body);
    expect(frames).toEqual([
      { event: 'delta', data: { text: 'Hello' } },
      { event: 'delta', data: { text: ' there!' } },
      { event: 'done', data: {} },
    ]);

    const history = await authedGraphQL(token, CHAT_HISTORY_QUERY, { conversationId });
    const messages = (
      history.json() as GraphQLResponse<{ chatHistory: Array<{ role: string; content: string }> }>
    ).data!.chatHistory;
    expect(messages).toEqual([
      { role: 'user', content: 'hi there' },
      { role: 'assistant', content: 'Hello there!' },
    ]);
  });

  // reply.hijack() opts out of the send lifecycle that normally flushes
  // headers set by onRequest hooks, so @fastify/cors's headers have to be
  // carried onto reply.raw by hand. Without them the browser passes the
  // preflight (@fastify/cors answers that itself, never reaching the
  // handler) and then blocks the response body — the stream never starts
  // for any cross-origin caller, i.e. production and any local setup with
  // VITE_API_URL pointed straight at :3001 rather than the Vite proxy.
  it('carries CORS headers onto the hijacked SSE response for a cross-origin caller', async () => {
    const token = await registerAndGetCookie();

    const res = await streamInject(
      token,
      { conversationId: 'nope', message: 'hi' },
      { origin: 'http://localhost:3000' },
    );

    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toContain('text/event-stream');
    expect(res.headers['access-control-allow-origin']).toBe('http://localhost:3000');
    expect(res.headers['access-control-allow-credentials']).toBe('true');
  });
});
