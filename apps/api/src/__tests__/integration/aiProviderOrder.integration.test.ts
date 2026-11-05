import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import { buildTestApp, type TestApp } from './helpers/buildTestApp.js';

const REGISTER = `mutation R($email: String!, $password: String!) { register(email: $email, password: $password) }`;
const SAVE_KEY = `mutation S($provider: String!, $apiKey: String!) { saveLlmApiKey(provider: $provider, apiKey: $apiKey) }`;
const DELETE_KEY = `mutation D($provider: String!) { deleteLlmApiKey(provider: $provider) }`;
const SET_ORDER = `mutation O($order: [String!]!) { setAiProviderOrder(order: $order) }`;
const SET_DEFAULT = `mutation P($provider: String!) { setDefaultLlmProvider(provider: $provider) }`;
const SET_SOURCE = `mutation A($aiSource: String!) { setAiSource(aiSource: $aiSource) }`;
const ME_ORDER = `{ me { aiProviderOrder } }`;

interface GraphQLResponse<T> {
  data: T | null;
  errors?: Array<{ message: string; extensions?: { code?: string } }>;
}

describe('AI provider order over GraphQL (JEF-503)', () => {
  let testApp: TestApp;

  beforeAll(async () => {
    // The platform factory reads these on every call, so they can be set after the module loads.
    vi.stubEnv('HOSTED_AI_ENABLED', 'true');
    vi.stubEnv('LLM_PROVIDER_MODE', 'fake');
    testApp = await buildTestApp();
  });

  afterAll(async () => {
    await testApp.cleanup();
    vi.unstubAllEnvs();
  });

  async function newUserToken(): Promise<string> {
    const res = await testApp.app.inject({
      method: 'POST',
      url: '/graphql',
      payload: {
        query: REGISTER,
        variables: { email: `${randomUUID()}@example.com`, password: 'correct-horse-1' },
      },
    });
    const cookies = res.cookies as Array<{ name: string; value: string }>;
    return cookies.find((c) => c.name === 'trakwyn_access_token')!.value;
  }

  async function gql<T = unknown>(
    token: string,
    query: string,
    variables?: Record<string, unknown>,
  ): Promise<GraphQLResponse<T>> {
    const res = await testApp.app.inject({
      method: 'POST',
      url: '/graphql',
      cookies: { trakwyn_access_token: token },
      payload: { query, variables },
    });
    return res.json() as GraphQLResponse<T>;
  }

  async function order(token: string): Promise<string[]> {
    const res = await gql<{ me: { aiProviderOrder: string[] } }>(token, ME_ORDER);
    return res.data!.me.aiProviderOrder;
  }

  const saveKey = (token: string, provider: string) =>
    gql(token, SAVE_KEY, { provider, apiKey: `sk-${provider}-test` });

  it('is empty for a free user with no key, as before hosted AI existed', async () => {
    const token = await newUserToken();

    expect(await order(token)).toEqual([]);
  });

  it('is derived from the older settings until the user saves a list: the default key, then the rest when fall-through is on', async () => {
    const token = await newUserToken();
    await saveKey(token, 'openai');
    await saveKey(token, 'anthropic');

    // The first key saved became the default; fall-through is off.
    expect(await order(token)).toEqual(['openai']);
  });

  it('saves a list and returns it in the order given', async () => {
    const token = await newUserToken();
    await saveKey(token, 'openai');
    await saveKey(token, 'anthropic');

    const saved = await gql<{ setAiProviderOrder: boolean }>(token, SET_ORDER, {
      order: ['anthropic', 'openai'],
    });

    expect(saved.errors).toBeUndefined();
    expect(saved.data?.setAiProviderOrder).toBe(true);
    expect(await order(token)).toEqual(['anthropic', 'openai']);
  });

  it('accepts Trakwyn AI in the list while hosted AI is on', async () => {
    const token = await newUserToken();
    await saveKey(token, 'openai');

    const saved = await gql(token, SET_ORDER, { order: ['openai', 'trakwyn'] });

    expect(saved.errors).toBeUndefined();
    expect(await order(token)).toEqual(['openai', 'trakwyn']);
  });

  it('refuses a provider the user has no key for, and keeps the previous list', async () => {
    const token = await newUserToken();
    await saveKey(token, 'openai');
    await gql(token, SET_ORDER, { order: ['openai'] });

    const refused = await gql(token, SET_ORDER, { order: ['openai', 'groq'] });

    expect(refused.errors?.[0]?.extensions?.code).toBe('VALIDATION');
    expect(await order(token)).toEqual(['openai']);
  });

  it('refuses an empty list and a repeated provider', async () => {
    const token = await newUserToken();
    await saveKey(token, 'openai');

    const empty = await gql(token, SET_ORDER, { order: [] });
    const repeated = await gql(token, SET_ORDER, { order: ['openai', 'openai'] });

    expect(empty.errors?.[0]?.extensions?.code).toBe('VALIDATION');
    expect(repeated.errors?.[0]?.extensions?.code).toBe('VALIDATION');
  });

  it('is cleared by an older app changing the default key, so that setting takes effect', async () => {
    const token = await newUserToken();
    await saveKey(token, 'openai');
    await saveKey(token, 'anthropic');
    await gql(token, SET_ORDER, { order: ['openai', 'anthropic'] });

    await gql(token, SET_DEFAULT, { provider: 'anthropic' });

    expect(await order(token)).toEqual(['anthropic']);
  });

  it('is cleared by an older app changing the AI source', async () => {
    const token = await newUserToken();
    await saveKey(token, 'openai');
    await gql(token, SET_ORDER, { order: ['openai', 'trakwyn'] });

    await gql(token, SET_SOURCE, { aiSource: 'trakwyn' });

    expect(await order(token)).toEqual(['trakwyn']);
  });

  it('loses a deleted key from the list and keeps the rest', async () => {
    const token = await newUserToken();
    await saveKey(token, 'openai');
    await saveKey(token, 'anthropic');
    await gql(token, SET_ORDER, { order: ['anthropic', 'openai'] });

    await gql(token, DELETE_KEY, { provider: 'anthropic' });

    expect(await order(token)).toEqual(['openai']);
  });

  it('needs a signed-in user', async () => {
    const res = await testApp.app.inject({
      method: 'POST',
      url: '/graphql',
      payload: { query: SET_ORDER, variables: { order: ['openai'] } },
    });

    const body = res.json() as GraphQLResponse<unknown>;
    expect(body.errors?.[0]?.extensions?.code).toBe('UNAUTHORIZED');
  });
});
