import { describe, it, expect, vi } from 'vitest';
import { Webhook } from 'standardwebhooks';
import { PolarBillingProvider } from '#src/infrastructure/billing/PolarBillingProvider.js';
import { UnauthorizedError } from '#src/use-cases/errors/DomainError.js';

const SECRET = `whsec_${Buffer.from('trakwyn-test-webhook-secret-0123').toString('base64')}`;

const PRODUCTS = {
  monthly: 'prod-monthly',
  founder_monthly: 'prod-founder',
  pass_3m: 'prod-pass-3m',
  pass_6m: 'prod-pass-6m',
} as const;

const reply = (body: unknown, status = 201) =>
  vi.fn().mockResolvedValue(new Response(JSON.stringify(body), { status }));

const make = (fetchImpl: typeof fetch = reply({}), server: 'sandbox' | 'production' = 'sandbox') =>
  new PolarBillingProvider({
    accessToken: 'polar_oat_test',
    webhookSecret: SECRET,
    server,
    products: PRODUCTS,
    fetchImpl,
  });

const checkoutData = {
  userId: 'user-1',
  email: 'a@b.com',
  product: 'monthly' as const,
  customerId: null,
  successUrl: 'https://www.trakwyn.com/settings/plan',
};

describe('PolarBillingProvider.createCheckoutSession', () => {
  it('posts the product, user and success url to the sandbox with the pinned version', async () => {
    const fetchImpl = reply({ url: 'https://sandbox.polar.sh/checkout/abc' });

    const result = await make(fetchImpl).createCheckoutSession(checkoutData);

    expect(result).toEqual({ url: 'https://sandbox.polar.sh/checkout/abc' });
    const [url, init] = fetchImpl.mock.calls[0];
    expect(url).toBe('https://sandbox-api.polar.sh/v1/checkouts/');
    expect(init.method).toBe('POST');
    expect(init.headers).toMatchObject({
      Authorization: 'Bearer polar_oat_test',
      'Polar-Version': '2026-10',
      'Content-Type': 'application/json',
    });
    expect(JSON.parse(init.body)).toEqual({
      products: ['prod-monthly'],
      success_url: 'https://www.trakwyn.com/settings/plan',
      metadata: { userId: 'user-1' },
      external_customer_id: 'user-1',
      customer_email: 'a@b.com',
    });
  });

  it('uses the production API when configured for it', async () => {
    const fetchImpl = reply({ url: 'https://polar.sh/checkout/abc' });

    await make(fetchImpl, 'production').createCheckoutSession(checkoutData);

    expect(fetchImpl.mock.calls[0][0]).toBe('https://api.polar.sh/v1/checkouts/');
  });

  it.each([
    ['monthly', 'prod-monthly'],
    ['founder_monthly', 'prod-founder'],
    ['pass_3m', 'prod-pass-3m'],
    ['pass_6m', 'prod-pass-6m'],
  ] as const)('maps %s to the Polar product %s', async (product, productId) => {
    const fetchImpl = reply({ url: 'https://sandbox.polar.sh/c' });

    await make(fetchImpl).createCheckoutSession({ ...checkoutData, product });

    expect(JSON.parse(fetchImpl.mock.calls[0][1].body).products).toEqual([productId]);
  });

  it('reuses the Polar customer of someone who has bought before instead of creating another', async () => {
    const fetchImpl = reply({ url: 'https://sandbox.polar.sh/c' });

    await make(fetchImpl).createCheckoutSession({ ...checkoutData, customerId: 'cus-1' });

    const body = JSON.parse(fetchImpl.mock.calls[0][1].body);
    expect(body.customer_id).toBe('cus-1');
    expect(body).not.toHaveProperty('external_customer_id');
    expect(body).not.toHaveProperty('customer_email');
    expect(body.metadata).toEqual({ userId: 'user-1' });
  });

  it('fails with the status only when Polar refuses, never quoting its body', async () => {
    const fetchImpl = reply({ detail: 'secret details a@b.com' }, 422);

    const failure = make(fetchImpl).createCheckoutSession(checkoutData);

    await expect(failure).rejects.toThrow('Polar answered 422 for POST /checkouts/');
    await expect(failure).rejects.not.toThrow(/a@b\.com/);
  });

  it('names the fields and messages of a validation error, but never the values sent', async () => {
    const fetchImpl = reply(
      {
        detail: [
          {
            loc: ['body', 'success_url'],
            msg: 'Input should be a valid URL',
            type: 'url_parsing',
            input: 'https://a@b.com/leaked',
          },
          { loc: ['body', 'products', 0], msg: 'Product not found', input: 'a@b.com' },
        ],
      },
      422,
    );

    const failure = make(fetchImpl).createCheckoutSession(checkoutData);

    await expect(failure).rejects.toThrow(
      'Polar answered 422 for POST /checkouts/: body.success_url: Input should be a valid URL; body.products.0: Product not found',
    );
    await expect(failure).rejects.not.toThrow(/a@b\.com|leaked/);
  });

  it('keeps the message short when Polar sends a long list of problems', async () => {
    const detail = Array.from({ length: 20 }, (_, i) => ({ loc: ['body', `f${i}`], msg: 'bad' }));

    const failure = make(reply({ detail }, 422)).createCheckoutSession(checkoutData);

    await expect(failure).rejects.toThrow(/f0.*f4/);
    await expect(failure).rejects.not.toThrow(/f5/);
  });

  it('fails when Polar answers without a checkout url', async () => {
    await expect(make(reply({})).createCheckoutSession(checkoutData)).rejects.toThrow(/url/);
  });
});

describe('PolarBillingProvider.createPortalSession', () => {
  it('opens a customer session and returns the portal url', async () => {
    const fetchImpl = reply({ customer_portal_url: 'https://sandbox.polar.sh/portal/xyz' });

    const result = await make(fetchImpl).createPortalSession({
      customerId: 'cus-1',
      returnUrl: 'https://www.trakwyn.com/settings/plan',
    });

    expect(result).toEqual({ url: 'https://sandbox.polar.sh/portal/xyz' });
    const [url, init] = fetchImpl.mock.calls[0];
    expect(url).toBe('https://sandbox-api.polar.sh/v1/customer-sessions/');
    expect(JSON.parse(init.body)).toEqual({
      customer_id: 'cus-1',
      return_url: 'https://www.trakwyn.com/settings/plan',
    });
  });

  it('fails with the status only when Polar refuses', async () => {
    await expect(
      make(reply({}, 404)).createPortalSession({ customerId: 'c', returnUrl: 'https://x.test' }),
    ).rejects.toThrow('Polar answered 404 for POST /customer-sessions/');
  });
});

describe('PolarBillingProvider.parseWebhook', () => {
  const body = JSON.stringify({
    type: 'subscription.active',
    timestamp: '2026-11-01T10:00:00Z',
    data: {
      id: 'sub-1',
      customer_id: 'cus-1',
      customer: { external_id: 'user-1' },
      metadata: { userId: 'user-1' },
    },
  });

  const signed = (payload = body, id = 'msg-1', at = new Date()) => {
    const seconds = Math.floor(at.getTime() / 1000);
    return {
      rawBody: Buffer.from(payload),
      headers: {
        'webhook-id': id,
        'webhook-timestamp': String(seconds),
        'webhook-signature': new Webhook(SECRET).sign(id, at, payload),
      },
    };
  };

  it('verifies the signature and returns the event, keyed by the delivery id', () => {
    const { rawBody, headers } = signed();

    expect(make().parseWebhook(rawBody, headers)).toEqual({
      id: 'msg-1',
      userId: 'user-1',
      customerId: 'cus-1',
      kind: 'subscription_started',
      subscriptionId: 'sub-1',
    });
  });

  it('gives a redelivery the same event id, so the use case can recognise it', () => {
    const first = signed(body, 'msg-1');
    const again = signed(body, 'msg-1', new Date(Date.now() + 1000));

    const a = make().parseWebhook(first.rawBody, first.headers);
    const b = make().parseWebhook(again.rawBody, again.headers);

    expect(b.id).toBe(a.id);
  });

  it('maps a paid one-off order for a pass product to the months it buys', () => {
    const payload = JSON.stringify({
      type: 'order.paid',
      timestamp: '2026-11-01T10:00:00Z',
      data: {
        id: 'ord-1',
        status: 'paid',
        billing_reason: 'purchase',
        subscription_id: null,
        product_id: 'prod-pass-6m',
        customer_id: 'cus-1',
        customer: { external_id: 'user-1' },
      },
    });
    const { rawBody, headers } = signed(payload);

    expect(make().parseWebhook(rawBody, headers)).toMatchObject({
      kind: 'pass_purchased',
      months: 6,
    });
  });

  it('rejects a body altered after signing', () => {
    const { headers } = signed();

    expect(() => make().parseWebhook(Buffer.from(body.replace('sub-1', 'sub-2')), headers)).toThrow(
      UnauthorizedError,
    );
  });

  it('rejects a signature made with another secret', () => {
    const at = new Date();
    const other = new Webhook(
      `whsec_${Buffer.from('another-secret-another-secret-12').toString('base64')}`,
    );
    const headers = {
      'webhook-id': 'msg-1',
      'webhook-timestamp': String(Math.floor(at.getTime() / 1000)),
      'webhook-signature': other.sign('msg-1', at, body),
    };

    expect(() => make().parseWebhook(Buffer.from(body), headers)).toThrow(UnauthorizedError);
  });

  it('rejects missing headers', () => {
    expect(() => make().parseWebhook(Buffer.from(body), {})).toThrow(UnauthorizedError);
  });

  it('rejects a header sent more than once', () => {
    const { rawBody, headers } = signed();

    expect(() =>
      make().parseWebhook(rawBody, { ...headers, 'webhook-id': ['msg-1', 'msg-2'] }),
    ).toThrow(UnauthorizedError);
  });

  it('rejects a delivery signed long ago, so a captured one cannot be replayed later', () => {
    const { rawBody, headers } = signed(body, 'msg-1', new Date(Date.now() - 60 * 60 * 1000));

    expect(() => make().parseWebhook(rawBody, headers)).toThrow(UnauthorizedError);
  });

  it('acknowledges an event type it does not act on', () => {
    const payload = JSON.stringify({ type: 'customer.created', data: { id: 'cus-1' } });
    const { rawBody, headers } = signed(payload);

    expect(make().parseWebhook(rawBody, headers).kind).toBe('ignored');
  });
});
