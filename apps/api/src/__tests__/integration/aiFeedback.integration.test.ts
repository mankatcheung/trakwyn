import { describe, it, expect, beforeAll, afterAll, vi, afterEach } from 'vitest';
import { randomUUID } from 'node:crypto';
import { ROUTES } from '#src/http/constants.js';
import { chatPrompt } from '#src/use-cases/prompts/chat.js';
import type { Cradle } from '#src/http/di/types.js';
import { buildTestApp, type TestApp } from './helpers/buildTestApp.js';

const REGISTER = `mutation R($email: String!, $password: String!) { register(email: $email, password: $password) }`;
const SAVE_KEY = `mutation K($provider: String!, $apiKey: String!) { saveLlmApiKey(provider: $provider, apiKey: $apiKey) }`;
const CREATE_CONVERSATION = `mutation C($provider: String) { createConversation(provider: $provider) { id } }`;
const ME = `query { me { id } }`;
const HISTORY = `
  query H($conversationId: ID!) {
    chatHistory(conversationId: $conversationId) {
      id role myRating { rating reason }
    }
  }
`;
const RATE = `
  mutation Rate($kind: AiFeedbackTarget!, $id: ID!, $rating: AiFeedbackRating!, $reason: AiFeedbackReason) {
    rateAiOutput(targetKind: $kind, targetId: $id, rating: $rating, reason: $reason) { rating reason }
  }
`;
const CLEAR = `mutation Clear($kind: AiFeedbackTarget!, $id: ID!) { clearAiOutputRating(targetKind: $kind, targetId: $id) }`;

interface GraphQLResponse<T> {
  data: T | null;
  errors?: Array<{ message: string; extensions?: { code?: string } }>;
}

/** One OpenAI-compatible streamed text completion. */
function textCompletion(text: string) {
  const encoder = new TextEncoder();
  const sse =
    `data: ${JSON.stringify({ choices: [{ delta: { content: text } }] })}\n\n` +
    `data: {"choices":[{"delta":{},"finish_reason":"stop"}]}\n\ndata: [DONE]\n\n`;
  return {
    ok: true,
    status: 200,
    body: new ReadableStream({
      start(controller) {
        controller.enqueue(encoder.encode(sse));
        controller.close();
      },
    }),
    text: () => Promise.resolve(''),
  };
}

describe('AI output feedback (JEF-547)', () => {
  let testApp: TestApp;

  beforeAll(async () => {
    testApp = await buildTestApp();
  });
  afterAll(async () => {
    await testApp.cleanup();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  const gql = <T>(token: string, query: string, variables?: Record<string, unknown>) =>
    testApp.app
      .inject({
        method: 'POST',
        url: '/graphql',
        cookies: { trakwyn_access_token: token },
        payload: { query, variables },
      })
      .then((res) => res.json() as GraphQLResponse<T>);

  /** A user with an OpenAI key and one answered chat turn. */
  async function userWithReply() {
    const res = await testApp.app.inject({
      method: 'POST',
      url: '/graphql',
      payload: {
        query: REGISTER,
        variables: { email: `${randomUUID()}@example.com`, password: 'correct-horse-1' },
      },
    });
    const token = (res.cookies as Array<{ name: string; value: string }>).find(
      (c) => c.name === 'trakwyn_access_token',
    )!.value;
    await gql(token, SAVE_KEY, { provider: 'openai', apiKey: 'test-key' });
    const created = await gql<{ createConversation: { id: string } }>(token, CREATE_CONVERSATION, {
      provider: 'openai',
    });
    const conversationId = created.data!.createConversation.id;

    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(textCompletion('Here is my answer.')));
    await testApp.app.inject({
      method: 'POST',
      url: ROUTES.CHAT_STREAM,
      cookies: { trakwyn_access_token: token },
      payload: { conversationId, message: 'a private question' },
    });

    const history = await gql<{ chatHistory: Array<{ id: string; role: string }> }>(
      token,
      HISTORY,
      { conversationId },
    );
    const messages = history.data!.chatHistory;
    const me = await gql<{ me: { id: string } }>(token, ME);
    return {
      token,
      conversationId,
      userId: me.data!.me.id,
      userMessageId: messages.find((m) => m.role === 'user')!.id,
      assistantMessageId: messages.find((m) => m.role === 'assistant')!.id,
    };
  }

  const myRatings = (token: string, conversationId: string) =>
    gql<{
      chatHistory: Array<{
        role: string;
        myRating: { rating: string; reason: string | null } | null;
      }>;
    }>(token, HISTORY, { conversationId }).then((r) =>
      r.data!.chatHistory.map((m) => [m.role, m.myRating] as const),
    );

  it('rates a reply, shows the rating again on reload, replaces it and clears it', async () => {
    const { token, conversationId, assistantMessageId } = await userWithReply();
    expect(await myRatings(token, conversationId)).toEqual([
      ['user', null],
      ['assistant', null],
    ]);

    const down = await gql<{ rateAiOutput: { rating: string; reason: string } }>(token, RATE, {
      kind: 'CHAT_MESSAGE',
      id: assistantMessageId,
      rating: 'DOWN',
      reason: 'WRONG_OR_MADE_UP',
    });
    expect(down.data!.rateAiOutput).toEqual({ rating: 'DOWN', reason: 'WRONG_OR_MADE_UP' });
    expect((await myRatings(token, conversationId))[1][1]).toEqual({
      rating: 'DOWN',
      reason: 'WRONG_OR_MADE_UP',
    });

    // Rating again replaces the earlier one.
    await gql(token, RATE, { kind: 'CHAT_MESSAGE', id: assistantMessageId, rating: 'UP' });
    expect((await myRatings(token, conversationId))[1][1]).toEqual({
      rating: 'UP',
      reason: null,
    });

    const cleared = await gql<{ clearAiOutputRating: boolean }>(token, CLEAR, {
      kind: 'CHAT_MESSAGE',
      id: assistantMessageId,
    });
    expect(cleared.data!.clearAiOutputRating).toBe(true);
    expect((await myRatings(token, conversationId))[1][1]).toBeNull();
  });

  it('stores which model and prompt wrote the reply, and none of its text', async () => {
    const { token, userId, assistantMessageId } = await userWithReply();
    await gql(token, RATE, {
      kind: 'CHAT_MESSAGE',
      id: assistantMessageId,
      rating: 'DOWN',
      reason: 'NOT_USEFUL',
    });

    const { aiFeedbackRepository } = testApp.app.diContainer.cradle as unknown as Cradle;
    const [row] = await aiFeedbackRepository.findForTargets(userId, 'chat_message', [
      assistantMessageId,
    ]);

    expect(row).toMatchObject({
      feature: 'chat',
      rating: 'down',
      reason: 'not_useful',
      generation: {
        provider: 'openai',
        promptVersion: chatPrompt.version,
        source: 'byok',
      },
    });
    expect(row.generation?.model).toBeTruthy();
    const stored = JSON.stringify(row);
    expect(stored).not.toContain('Here is my answer');
    expect(stored).not.toContain('a private question');
  });

  it("returns NOT_FOUND when rating another user's message", async () => {
    const owner = await userWithReply();
    const stranger = await userWithReply();

    const res = await gql(stranger.token, RATE, {
      kind: 'CHAT_MESSAGE',
      id: owner.assistantMessageId,
      rating: 'UP',
    });

    expect(res.errors?.[0].extensions?.code).toBe('NOT_FOUND');
    expect(await myRatings(owner.token, owner.conversationId)).toEqual([
      ['user', null],
      ['assistant', null],
    ]);
  });

  it('rejects a rating on the user’s own message', async () => {
    const { token, userMessageId } = await userWithReply();

    const res = await gql(token, RATE, { kind: 'CHAT_MESSAGE', id: userMessageId, rating: 'UP' });

    expect(res.errors?.[0].extensions?.code).toBe('VALIDATION');
  });

  it('rejects a reason on a thumbs up, and a free-text reason never gets through the schema', async () => {
    const { token, assistantMessageId } = await userWithReply();

    const withReason = await gql(token, RATE, {
      kind: 'CHAT_MESSAGE',
      id: assistantMessageId,
      rating: 'UP',
      reason: 'NOT_USEFUL',
    });
    expect(withReason.errors?.[0].extensions?.code).toBe('VALIDATION');

    const freeText = await gql(token, RATE, {
      kind: 'CHAT_MESSAGE',
      id: assistantMessageId,
      rating: 'DOWN',
      reason: 'it was rude about my CV',
    });
    expect(freeText.data).toBeFalsy();
    expect(freeText.errors?.length).toBeGreaterThan(0);
  });

  it('requires a session', async () => {
    const res = await testApp.app.inject({
      method: 'POST',
      url: '/graphql',
      payload: {
        query: RATE,
        variables: { kind: 'CHAT_MESSAGE', id: 'x', rating: 'UP' },
      },
    });

    expect((res.json() as GraphQLResponse<unknown>).errors?.[0].extensions?.code).toBe(
      'UNAUTHORIZED',
    );
  });
});
