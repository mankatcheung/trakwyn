import { describe, it, expect, beforeAll, afterAll, vi, afterEach } from 'vitest';
import { randomUUID } from 'node:crypto';
import { ROUTES } from '#src/http/constants.js';
import { buildTestApp, type TestApp } from './helpers/buildTestApp.js';

const REGISTER = `mutation R($email: String!, $password: String!) { register(email: $email, password: $password) }`;
const SAVE_KEY = `mutation K($provider: String!, $apiKey: String!) { saveLlmApiKey(provider: $provider, apiKey: $apiKey) }`;
const CREATE_CONVERSATION = `mutation C($provider: String) { createConversation(provider: $provider) { id } }`;
const HISTORY = `
  query H($conversationId: ID!) {
    chatHistory(conversationId: $conversationId) {
      role content proposals { id toolName summary status error }
    }
  }
`;
const APPLICATIONS = `query { applications { id company role } }`;
const CONFIRM = `mutation($id: ID!) { confirmChatAction(id: $id) { id status } }`;
const DISMISS = `mutation($id: ID!) { dismissChatAction(id: $id) { id status } }`;

interface GraphQLResponse<T> {
  data: T | null;
  errors?: Array<{ message: string; extensions?: { code?: string } }>;
}

/** One OpenAI-compatible streamed completion: either text or a single tool call. */
function completion(part: { text: string } | { tool: string; args: Record<string, unknown> }) {
  const encoder = new TextEncoder();
  const delta =
    'text' in part
      ? { content: part.text }
      : {
          tool_calls: [
            {
              index: 0,
              id: 'call_1',
              function: { name: part.tool, arguments: JSON.stringify(part.args) },
            },
          ],
        };
  const sse =
    `data: ${JSON.stringify({ choices: [{ delta }] })}\n\n` +
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

function parseFrames(body: string): Array<{ event: string; data: Record<string, unknown> }> {
  return body
    .split('\n\n')
    .filter(Boolean)
    .map((raw) => {
      const lines = raw.split('\n');
      return {
        event: lines
          .find((l) => l.startsWith('event:'))!
          .slice(6)
          .trim(),
        data: JSON.parse(
          lines
            .find((l) => l.startsWith('data:'))!
            .slice(5)
            .trim(),
        ),
      };
    });
}

describe('chat write proposals (JEF-469)', () => {
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

  async function newUser() {
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
    return { token, conversationId: created.data!.createConversation.id };
  }

  /** The model asks to create an application, then replies in text. */
  async function propose(token: string, conversationId: string, message = 'add Acme') {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        completion({ tool: 'create_application', args: { company: 'Acme', role: 'Engineer' } }),
      )
      .mockResolvedValueOnce(completion({ text: 'I have proposed adding it.' }));
    vi.stubGlobal('fetch', fetchMock);
    const res = await testApp.app.inject({
      method: 'POST',
      url: ROUTES.CHAT_STREAM,
      cookies: { trakwyn_access_token: token },
      payload: { conversationId, message },
    });
    return { frames: parseFrames(res.body), fetchMock };
  }

  it('streams a proposal and changes nothing until Confirm, then applies it once', async () => {
    const { token, conversationId } = await newUser();

    const { frames } = await propose(token, conversationId);

    const proposal = frames.find((f) => f.event === 'proposal')!;
    expect(proposal.data).toEqual({
      id: expect.any(String),
      toolName: 'create_application',
      summary: 'Add application: Acme / Engineer',
    });
    expect(frames[frames.length - 1].event).toBe('done');
    const before = await gql<{ applications: unknown[] }>(token, APPLICATIONS);
    expect(before.data!.applications).toEqual([]);

    // Reopening the conversation shows the card still pending, on the assistant reply.
    const pending = await gql<{ chatHistory: Array<{ role: string; proposals: unknown[] }> }>(
      token,
      HISTORY,
      { conversationId },
    );
    expect(pending.data!.chatHistory.map((m) => [m.role, m.proposals.length])).toEqual([
      ['user', 0],
      ['assistant', 1],
    ]);

    const id = proposal.data.id as string;
    const confirmed = await gql<{ confirmChatAction: { status: string } }>(token, CONFIRM, { id });
    expect(confirmed.data!.confirmChatAction.status).toBe('confirmed');
    const after = await gql<{ applications: Array<{ company: string }> }>(token, APPLICATIONS);
    expect(after.data!.applications).toEqual([expect.objectContaining({ company: 'Acme' })]);

    const again = await gql(token, CONFIRM, { id });
    expect(again.errors?.[0].extensions?.code).toBe('CONFLICT');
    const still = await gql<{ applications: unknown[] }>(token, APPLICATIONS);
    expect(still.data!.applications).toHaveLength(1);

    // History shows the resolved card, and none of the app's notes to the model.
    const resolved = await gql<{
      chatHistory: Array<{ role: string; proposals: Array<{ status: string }> }>;
    }>(token, HISTORY, { conversationId });
    expect(resolved.data!.chatHistory.map((m) => m.role)).toEqual(['user', 'assistant']);
    expect(resolved.data!.chatHistory[1].proposals[0].status).toBe('confirmed');
  });

  it('tells the model on the next turn what the user decided', async () => {
    const { token, conversationId } = await newUser();
    const { frames } = await propose(token, conversationId);
    await gql(token, DISMISS, { id: frames.find((f) => f.event === 'proposal')!.data.id });

    const fetchMock = vi.fn().mockResolvedValue(completion({ text: 'Okay, I will leave it.' }));
    vi.stubGlobal('fetch', fetchMock);
    await testApp.app.inject({
      method: 'POST',
      url: ROUTES.CHAT_STREAM,
      cookies: { trakwyn_access_token: token },
      payload: { conversationId, message: 'did that go through?' },
    });

    const prompt = JSON.stringify(JSON.parse(fetchMock.mock.calls[0][1].body).messages);
    expect(prompt).toContain('Note from the app: User dismissed: Add application: Acme / Engineer');
    const apps = await gql<{ applications: unknown[] }>(token, APPLICATIONS);
    expect(apps.data!.applications).toEqual([]);
  });

  it("refuses another user's proposal, and a dismissed one cannot be confirmed", async () => {
    const owner = await newUser();
    const intruder = await newUser();
    const { frames } = await propose(owner.token, owner.conversationId);
    const id = frames.find((f) => f.event === 'proposal')!.data.id as string;

    const foreignConfirm = await gql(intruder.token, CONFIRM, { id });
    const foreignDismiss = await gql(intruder.token, DISMISS, { id });
    expect(foreignConfirm.errors?.[0].extensions?.code).toBe('NOT_FOUND');
    expect(foreignDismiss.errors?.[0].extensions?.code).toBe('NOT_FOUND');

    await gql(owner.token, DISMISS, { id });
    const late = await gql(owner.token, CONFIRM, { id });
    expect(late.errors?.[0].extensions?.code).toBe('CONFLICT');
    const apps = await gql<{ applications: unknown[] }>(owner.token, APPLICATIONS);
    expect(apps.data!.applications).toEqual([]);
  });

  it('fails a proposal naming a record the user does not own when it is proposed', async () => {
    const { token, conversationId } = await newUser();
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        completion({
          tool: 'update_application',
          args: { applicationId: 'someone-elses-app', status: 'rejected' },
        }),
      )
      .mockResolvedValueOnce(completion({ text: 'I could not find that application.' }));
    vi.stubGlobal('fetch', fetchMock);

    const res = await testApp.app.inject({
      method: 'POST',
      url: ROUTES.CHAT_STREAM,
      cookies: { trakwyn_access_token: token },
      payload: { conversationId, message: 'reject it' },
    });

    expect(parseFrames(res.body).map((f) => f.event)).toEqual(['delta', 'done']);
    const toolResult = JSON.parse(fetchMock.mock.calls[1][1].body).messages.at(-1).content;
    expect(toolResult).toContain('Application not found');
  });

  it('is behind the email verification wall', async () => {
    const { token } = await newUser();
    // Both mutations are absent from the allowlist, so the generic wall test covers
    // them; this just pins that an authenticated, verified caller reaches them.
    const res = await gql(token, CONFIRM, { id: 'missing' });
    expect(res.errors?.[0].extensions?.code).toBe('NOT_FOUND');
  });
});
