import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { randomUUID } from 'node:crypto';
import { ROUTES } from '#src/http/constants.js';
import { ENV } from '#src/infrastructure/config/constants.js';
import { JSON_RPC_ERROR, MCP } from '#src/interface-adapters/mcp/constants.js';
import { ERROR_CODES } from '#src/use-cases/errors/errorCodes.js';
import { buildTestApp, type TestApp } from './helpers/buildTestApp.js';

/**
 * The JEF-468 write tools end to end: real use cases, real repositories, so
 * ownership is checked by the code that enforces it rather than by a mock.
 */

const REGISTER_MUTATION = `
  mutation Register($email: String!, $password: String!) {
    register(email: $email, password: $password)
  }
`;

const CREATE_API_TOKEN_MUTATION = `
  mutation CreateApiToken($name: String!, $scope: ApiTokenScope) {
    createApiToken(name: $name, scope: $scope) { token }
  }
`;

const RESTORE_APPLICATION_MUTATION = `
  mutation RestoreApplication($id: ID!) { restoreApplication(id: $id) }
`;

interface JsonRpcResponse {
  result?: { content?: Array<{ text: string }>; [key: string]: unknown };
  error?: { code: number; message: string; data?: { code?: string } };
}

interface User {
  accessToken: string;
  fullToken: string;
}

async function registerUser(testApp: TestApp, scope: 'read' | 'full' = 'full'): Promise<User> {
  const register = await testApp.app.inject({
    method: 'POST',
    url: '/graphql',
    payload: {
      query: REGISTER_MUTATION,
      variables: { email: `${randomUUID()}@example.com`, password: 'correct-horse-1' },
    },
  });
  const accessToken = (register.json() as { data: { register: string } }).data.register;
  const tokenRes = await testApp.app.inject({
    method: 'POST',
    url: '/graphql',
    headers: { authorization: `Bearer ${accessToken}` },
    payload: { query: CREATE_API_TOKEN_MUTATION, variables: { name: 'JEF-468', scope } },
  });
  const fullToken = (tokenRes.json() as { data: { createApiToken: { token: string } } }).data
    .createApiToken.token;
  return { accessToken, fullToken };
}

async function rpc(
  testApp: TestApp,
  token: string,
  method: string,
  params?: Record<string, unknown>,
): Promise<JsonRpcResponse> {
  const res = await testApp.app.inject({
    method: 'POST',
    url: ROUTES.MCP,
    headers: { authorization: `Bearer ${token}` },
    payload: { jsonrpc: '2.0', id: 1, method, ...(params ? { params } : {}) },
  });
  return res.json() as JsonRpcResponse;
}

async function callTool(
  testApp: TestApp,
  token: string,
  name: string,
  args: Record<string, unknown>,
): Promise<JsonRpcResponse> {
  return rpc(testApp, token, 'tools/call', { name, arguments: args });
}

/** The parsed JSON of a successful tool call; fails the test on an error. */
async function toolResult<T>(
  testApp: TestApp,
  token: string,
  name: string,
  args: Record<string, unknown>,
): Promise<T> {
  const body = await callTool(testApp, token, name, args);
  expect(body.error, `${name}: ${body.error?.message}`).toBeUndefined();
  return JSON.parse(body.result!.content![0]!.text) as T;
}

describe('mcp write tools (JEF-468)', () => {
  let testApp: TestApp;

  beforeAll(async () => {
    delete process.env[ENV.PLANS_ENFORCED];
    testApp = await buildTestApp();
  });

  afterAll(async () => {
    await testApp.cleanup();
  });

  /** An application with one of every child record, owned by a fresh user. */
  async function seedOwner() {
    const owner = await registerUser(testApp);
    const app = await toolResult<{ id: string }>(testApp, owner.fullToken, 'create_application', {
      company: 'Initech',
      role: 'Engineer',
    });
    const note = await toolResult<{ id: string }>(testApp, owner.fullToken, 'create_note', {
      applicationId: app.id,
      content: 'first draft',
    });
    const contact = await toolResult<{ id: string }>(testApp, owner.fullToken, 'create_contact', {
      applicationId: app.id,
      name: 'Ada',
      role: 'Recruiter',
    });
    const round = await toolResult<{ id: string }>(
      testApp,
      owner.fullToken,
      'create_interview_round',
      { applicationId: app.id, type: 'phone' },
    );
    const offer = await toolResult<{ id: string; currency: string; period: string }>(
      testApp,
      owner.fullToken,
      'create_offer',
      { applicationId: app.id, baseSalary: 100000 },
    );
    return { owner, app, note, contact, round, offer };
  }

  it('advertises all seven tools, with annotations, to a full token on 2025-03-26', async () => {
    const { fullToken } = await registerUser(testApp);

    const init = await rpc(testApp, fullToken, 'initialize', { protocolVersion: '2025-03-26' });
    expect(init.result).toMatchObject({ protocolVersion: '2025-03-26' });

    const list = await rpc(testApp, fullToken, 'tools/list');
    const tools = (
      list.result as {
        tools: Array<{ name: string; annotations: Record<string, boolean> }>;
      }
    ).tools;
    const byName = new Map(tools.map((t) => [t.name, t.annotations]));

    for (const name of [
      'create_contact',
      'update_contact',
      'update_note',
      'update_interview_round',
      'create_offer',
      'update_offer',
      'trash_application',
    ]) {
      expect(byName.get(name), name).toMatchObject({ readOnlyHint: false });
    }
    expect(byName.get('trash_application')).toMatchObject({ destructiveHint: true });
    expect(tools.every((t) => t.annotations !== undefined)).toBe(true);
  });

  it('still lets a 2024-11-05 client connect and list tools', async () => {
    const { fullToken } = await registerUser(testApp);

    const init = await rpc(testApp, fullToken, 'initialize', { protocolVersion: '2024-11-05' });
    expect(init.result).toMatchObject({ protocolVersion: '2024-11-05' });

    const list = await rpc(testApp, fullToken, 'tools/list');
    expect(list.error).toBeUndefined();
  });

  it('answers an unknown client version with its latest', async () => {
    const { fullToken } = await registerUser(testApp);

    const init = await rpc(testApp, fullToken, 'initialize', { protocolVersion: '2099-01-01' });

    expect(init.result).toMatchObject({ protocolVersion: MCP.PROTOCOL_VERSION });
  });

  it('hides the new tools from a read token and refuses them when called', async () => {
    const { owner, app, note } = await seedOwner();
    const reader = await registerUser(testApp, 'read');

    const list = await rpc(testApp, reader.fullToken, 'tools/list');
    const names = (list.result as { tools: Array<{ name: string }> }).tools.map((t) => t.name);
    expect(names).not.toContain('update_note');
    expect(names).not.toContain('trash_application');

    // Refused on scope, before ownership is even looked at.
    const res = await callTool(testApp, reader.fullToken, 'update_note', {
      noteId: note.id,
      content: 'x',
    });
    expect(res.error?.message).toMatch(/read-only/);

    const notes = await toolResult<Array<{ content: string }>>(
      testApp,
      owner.fullToken,
      'list_notes',
      { applicationId: app.id },
    );
    expect(notes.map((n) => n.content)).toEqual(['first draft']);
  });

  it("edits the caller's own records", async () => {
    const { owner, app, note, contact, round, offer } = await seedOwner();
    const t = owner.fullToken;

    expect(offer).toMatchObject({ currency: 'USD', period: 'yearly' });

    await toolResult(testApp, t, 'update_note', { noteId: note.id, content: 'second draft' });
    await toolResult(testApp, t, 'update_contact', { contactId: contact.id, email: 'a@b.co' });
    await toolResult(testApp, t, 'update_interview_round', {
      interviewRoundId: round.id,
      outcome: 'passed',
    });
    await toolResult(testApp, t, 'update_offer', { offerId: offer.id, bonus: 5000 });

    const id = { applicationId: app.id };
    const [notes, contacts, rounds, offers] = await Promise.all([
      toolResult<Array<{ content: string }>>(testApp, t, 'list_notes', id),
      toolResult<Array<{ email: string | null; name: string }>>(testApp, t, 'list_contacts', id),
      toolResult<Array<{ outcome: string; type: string }>>(testApp, t, 'list_interview_rounds', id),
      toolResult<Array<{ bonus: number | null; baseSalary: number }>>(
        testApp,
        t,
        'list_offers',
        id,
      ),
    ]);
    expect(notes[0]).toMatchObject({ content: 'second draft' });
    // Fields not passed are left as they were.
    expect(contacts[0]).toMatchObject({ name: 'Ada', email: 'a@b.co' });
    expect(rounds[0]).toMatchObject({ type: 'phone', outcome: 'passed' });
    expect(offers[0]).toMatchObject({ baseSalary: 100000, bonus: 5000 });
  });

  it("refuses every new tool on another user's records, and changes nothing", async () => {
    const { owner, app, note, contact, round, offer } = await seedOwner();
    const intruder = await registerUser(testApp);

    const attempts: Array<[string, Record<string, unknown>]> = [
      ['update_note', { noteId: note.id, content: 'pwned' }],
      ['create_contact', { applicationId: app.id, name: 'Mallory' }],
      ['update_contact', { contactId: contact.id, name: 'Mallory' }],
      ['update_interview_round', { interviewRoundId: round.id, outcome: 'failed' }],
      ['create_offer', { applicationId: app.id, baseSalary: 1 }],
      ['update_offer', { offerId: offer.id, baseSalary: 1 }],
      ['trash_application', { applicationId: app.id }],
    ];
    for (const [name, args] of attempts) {
      const res = await callTool(testApp, intruder.fullToken, name, args);
      expect(res.error, name).toMatchObject({ code: JSON_RPC_ERROR.INVALID_PARAMS });
      expect([ERROR_CODES.NOT_FOUND, ERROR_CODES.FORBIDDEN], name).toContain(res.error?.data?.code);
    }

    const t = owner.fullToken;
    const id = { applicationId: app.id };
    expect(await toolResult(testApp, t, 'get_application', id)).toMatchObject({ id: app.id });
    expect(await toolResult(testApp, t, 'list_notes', id)).toEqual([
      expect.objectContaining({ content: 'first draft' }),
    ]);
    expect(await toolResult(testApp, t, 'list_contacts', id)).toEqual([
      expect.objectContaining({ name: 'Ada' }),
    ]);
    expect(await toolResult(testApp, t, 'list_interview_rounds', id)).toEqual([
      expect.objectContaining({ outcome: 'pending' }),
    ]);
    expect(await toolResult(testApp, t, 'list_offers', id)).toEqual([
      expect.objectContaining({ baseSalary: 100000 }),
    ]);
  });

  it('trash_application moves the application to Trash, where the web app can restore it', async () => {
    const { owner, app } = await seedOwner();
    const t = owner.fullToken;

    expect(await toolResult(testApp, t, 'trash_application', { applicationId: app.id })).toEqual({
      applicationId: app.id,
      trashed: true,
    });

    // Gone from every tool at once…
    const page = await toolResult<{ items: Array<{ id: string }> }>(
      testApp,
      t,
      'list_applications',
      {},
    );
    expect(page.items.map((i) => i.id)).not.toContain(app.id);
    const hidden = await callTool(testApp, t, 'get_application', { applicationId: app.id });
    expect(hidden.error?.data?.code).toBe(ERROR_CODES.NOT_FOUND);

    // …but only soft-deleted: the restore mutation the web app's Trash calls brings it back.
    const restore = await testApp.app.inject({
      method: 'POST',
      url: '/graphql',
      headers: { authorization: `Bearer ${owner.accessToken}` },
      payload: { query: RESTORE_APPLICATION_MUTATION, variables: { id: app.id } },
    });
    expect(restore.json()).toEqual({ data: { restoreApplication: true } });
    expect(
      await toolResult(testApp, t, 'get_application', { applicationId: app.id }),
    ).toMatchObject({ id: app.id, company: 'Initech' });
    expect(await toolResult(testApp, t, 'list_notes', { applicationId: app.id })).toHaveLength(1);
  });
});

describe('mcp write tools with plans enforced (JEF-468)', () => {
  let testApp: TestApp;

  beforeAll(async () => {
    process.env[ENV.PLANS_ENFORCED] = 'true';
    testApp = await buildTestApp();
  });

  afterAll(async () => {
    await testApp.cleanup();
    delete process.env[ENV.PLANS_ENFORCED];
  });

  it('create_offer on a Free plan answers PLAN_REQUIRED and records nothing', async () => {
    const { fullToken } = await registerUser(testApp);
    const app = await toolResult<{ id: string }>(testApp, fullToken, 'create_application', {
      company: 'Initech',
      role: 'Engineer',
    });

    const res = await callTool(testApp, fullToken, 'create_offer', {
      applicationId: app.id,
      baseSalary: 100000,
    });

    expect(res.error).toMatchObject({
      code: JSON_RPC_ERROR.INVALID_PARAMS,
      data: { code: ERROR_CODES.PLAN_REQUIRED },
    });
    expect(await toolResult(testApp, fullToken, 'list_offers', { applicationId: app.id })).toEqual(
      [],
    );
  });
});
