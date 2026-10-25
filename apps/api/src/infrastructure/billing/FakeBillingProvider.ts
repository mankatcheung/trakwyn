import { createHmac, timingSafeEqual } from 'node:crypto';
import { z } from 'zod';
import type { BillingWebhookEvent } from '#src/domain/billing/Billing.js';
import { UnauthorizedError } from '#src/use-cases/errors/DomainError.js';
import type {
  CreateCheckoutSessionData,
  IBillingProvider,
} from '#src/use-cases/ports/IBillingProvider.js';
import { BILLING_ADAPTER } from '#src/infrastructure/config/constants.js';

const eventSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('subscription_started'), subscriptionId: z.string() }),
  z.object({ kind: z.literal('pass_purchased'), months: z.union([z.literal(3), z.literal(6)]) }),
  z.object({
    kind: z.literal('subscription_cancelled'),
    subscriptionId: z.string(),
    endsAt: z.coerce.date(),
  }),
  z.object({
    kind: z.literal('payment_reversed'),
    product: z.enum(['subscription', 'pass']),
    subscriptionId: z.string().nullable().default(null),
  }),
  z.object({ kind: z.literal('ignored') }),
]);

const envelopeSchema = z.object({
  id: z.string().min(1),
  userId: z.string().nullable().default(null),
  customerId: z.string().nullable().default(null),
});

/** The signature the fake provider expects over `rawBody`. Exported so dev scripts and tests can sign. */
export function signFakeWebhook(rawBody: Buffer | string): string {
  return createHmac('sha256', BILLING_ADAPTER.FAKE_WEBHOOK_SECRET).update(rawBody).digest('hex');
}

/**
 * Stands in for the payment provider in dev, CI and e2e (JEF-426): no
 * credentials, no network. Checkout sends the browser straight back to the
 * success URL; webhooks are posted by hand or by a test, signed with
 * `signFakeWebhook`. It still verifies signatures, so the webhook route's
 * rejection path is exercised for real.
 */
export class FakeBillingProvider implements IBillingProvider {
  async createCheckoutSession(data: CreateCheckoutSessionData): Promise<{ url: string }> {
    const url = new URL(data.successUrl);
    url.searchParams.set('fake_checkout', data.product);
    return { url: url.toString() };
  }

  async createPortalSession(data: { customerId: string; returnUrl: string }): Promise<{
    url: string;
  }> {
    const url = new URL(data.returnUrl);
    url.searchParams.set('fake_portal', data.customerId);
    return { url: url.toString() };
  }

  /** Subscription ids revoked so far, for a test or a look at what dev would have stopped. */
  readonly revokedSubscriptions: string[] = [];

  async revokeSubscription(subscriptionId: string): Promise<void> {
    this.revokedSubscriptions.push(subscriptionId);
  }

  parseWebhook(
    rawBody: Buffer,
    headers: Record<string, string | string[] | undefined>,
  ): BillingWebhookEvent {
    const header = headers[BILLING_ADAPTER.FAKE_SIGNATURE_HEADER];
    const given = Buffer.from(typeof header === 'string' ? header : '', 'utf8');
    const expected = Buffer.from(signFakeWebhook(rawBody), 'utf8');
    if (given.length !== expected.length || !timingSafeEqual(given, expected)) {
      throw new UnauthorizedError('Invalid webhook signature');
    }

    let json: unknown;
    try {
      json = JSON.parse(rawBody.toString('utf8'));
    } catch {
      throw new UnauthorizedError('Invalid webhook body');
    }
    const envelope = envelopeSchema.safeParse(json);
    const body = eventSchema.safeParse(json);
    if (!envelope.success || !body.success) throw new UnauthorizedError('Invalid webhook body');
    return { ...envelope.data, ...body.data };
  }
}
