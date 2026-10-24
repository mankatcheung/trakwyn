import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { randomUUID } from 'node:crypto';
import { buildTestApp, type TestApp } from './helpers/buildTestApp.js';
import { signFakeWebhook } from '#src/infrastructure/billing/FakeBillingProvider.js';
import { BILLING_ADAPTER } from '#src/infrastructure/config/constants.js';

const REGISTER = `
  mutation RegisterMobile($email: String!, $password: String!) {
    registerMobile(email: $email, password: $password) { accessToken }
  }
`;
const ME = `query { me { id } }`;
const STATUS = `query { billingStatus { plan planSource planExpiresAt } }`;
const CHECKOUT = `
  mutation Checkout($plan: CheckoutPlan!) { createCheckoutSession(plan: $plan) { url } }
`;
const PORTAL = `mutation { createBillingPortalSession { url } }`;

interface GraphQLResponse<T> {
  data: T | null;
  errors?: Array<{ message: string; extensions?: { code?: string } }>;
}

describe('billing webhook integration (BILLING_PROVIDER=fake)', () => {
  let testApp: TestApp;

  beforeAll(async () => {
    testApp = await buildTestApp();
  });
  afterAll(() => testApp.cleanup());

  async function gql<T>(token: string, query: string, variables?: Record<string, unknown>) {
    const res = await testApp.app.inject({
      method: 'POST',
      url: '/graphql',
      headers: { authorization: `Bearer ${token}` },
      payload: { query, variables },
    });
    return res.json() as GraphQLResponse<T>;
  }

  async function newUser(): Promise<{ token: string; userId: string }> {
    const res = await testApp.app.inject({
      method: 'POST',
      url: '/graphql',
      payload: {
        query: REGISTER,
        variables: { email: `${randomUUID()}@example.com`, password: 'correct-horse-1' },
      },
    });
    const token = (res.json() as GraphQLResponse<{ registerMobile: { accessToken: string } }>).data!
      .registerMobile.accessToken;
    const me = await gql<{ me: { id: string } }>(token, ME);
    return { token, userId: me.data!.me.id };
  }

  function postWebhook(body: unknown, signature?: string) {
    const raw = JSON.stringify(body);
    return testApp.app.inject({
      method: 'POST',
      url: '/billing/webhook',
      headers: {
        'content-type': 'application/json',
        [BILLING_ADAPTER.FAKE_SIGNATURE_HEADER]: signature ?? signFakeWebhook(raw),
      },
      payload: raw,
    });
  }

  const status = async (token: string) =>
    (
      await gql<{
        billingStatus: { plan: string; planSource: string | null; planExpiresAt: string | null };
      }>(token, STATUS)
    ).data!.billingStatus;

  it('upgrades the user when a signed purchase arrives', async () => {
    const { token, userId } = await newUser();
    const res = await postWebhook({
      id: randomUUID(),
      userId,
      customerId: 'cus-1',
      kind: 'pass_purchased',
      months: 3,
    });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ ok: true, outcome: 'applied' });
    const after = await status(token);
    expect(after.plan).toBe('pro');
    expect(after.planSource).toBe('pass');
    expect(new Date(after.planExpiresAt!).getTime()).toBeGreaterThan(Date.now());
  });

  it('changes nothing when the same event is replayed', async () => {
    const { token, userId } = await newUser();
    const body = {
      id: randomUUID(),
      userId,
      customerId: 'cus-2',
      kind: 'pass_purchased',
      months: 3,
    };
    await postWebhook(body);
    const first = await status(token);

    const replay = await postWebhook(body);
    expect(replay.json()).toEqual({ ok: true, outcome: 'duplicate' });
    expect(await status(token)).toEqual(first);
  });

  it('rejects a bad signature and leaves the user on Free', async () => {
    const { token, userId } = await newUser();
    const res = await postWebhook(
      { id: randomUUID(), userId, customerId: 'cus-3', kind: 'pass_purchased', months: 3 },
      'deadbeef',
    );
    expect(res.statusCode).toBe(401);
    expect((await status(token)).plan).toBe('free');
  });

  it('rejects an unsigned request', async () => {
    const res = await testApp.app.inject({
      method: 'POST',
      url: '/billing/webhook',
      headers: { 'content-type': 'application/json' },
      payload: '{}',
    });
    expect(res.statusCode).toBe(401);
  });

  it('downgrades on a refund', async () => {
    const { token, userId } = await newUser();
    await postWebhook({
      id: randomUUID(),
      userId,
      customerId: 'cus-4',
      kind: 'pass_purchased',
      months: 6,
    });
    await postWebhook({
      id: randomUUID(),
      userId,
      customerId: 'cus-4',
      kind: 'payment_reversed',
      product: 'pass',
    });
    expect((await status(token)).plan).toBe('free');
  });

  it('sends the buyer to checkout, and to the portal only once they have paid', async () => {
    const { token, userId } = await newUser();
    const checkout = await gql<{ createCheckoutSession: { url: string } }>(token, CHECKOUT, {
      plan: 'pass3Months',
    });
    expect(checkout.data!.createCheckoutSession.url).toContain('/settings/plan');

    const early = await gql(token, PORTAL);
    expect(early.errors?.[0].extensions?.code).toBe('CONFLICT');

    await postWebhook({
      id: randomUUID(),
      userId,
      customerId: 'cus-5',
      kind: 'pass_purchased',
      months: 3,
    });
    const portal = await gql<{ createBillingPortalSession: { url: string } }>(token, PORTAL);
    expect(portal.data!.createBillingPortalSession.url).toContain('fake_portal=cus-5');
  });
});
