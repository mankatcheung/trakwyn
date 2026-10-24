import { z } from 'zod';
import type { BillingWebhookEvent } from '#src/domain/billing/Billing.js';
import { POLAR } from '#src/infrastructure/config/constants.js';

const envelopeSchema = z.object({
  type: z.string(),
  timestamp: z.coerce.date().optional(),
  data: z.unknown(),
});

const customerFields = {
  customer_id: z.string().nullish(),
  customer: z.object({ external_id: z.string().nullish() }).nullish(),
  metadata: z.record(z.string(), z.unknown()).nullish(),
};

const subscriptionSchema = z.object({
  id: z.string(),
  ends_at: z.coerce.date().nullish(),
  ended_at: z.coerce.date().nullish(),
  current_period_end: z.coerce.date().nullish(),
  ...customerFields,
});

const orderSchema = z.object({
  id: z.string(),
  status: z.string(),
  billing_reason: z.string().optional(),
  subscription_id: z.string().nullish(),
  product_id: z.string().nullish(),
  ...customerFields,
});

type WithCustomer = {
  customer_id?: string | null;
  customer?: { external_id?: string | null } | null;
  metadata?: Record<string, unknown> | null;
};

/** The Trakwyn user id: Polar's external customer id, else the checkout metadata. */
function ownerOf(data: WithCustomer): Pick<BillingWebhookEvent, 'userId' | 'customerId'> {
  const fromMetadata = data.metadata?.[POLAR.METADATA_USER_ID];
  return {
    userId: data.customer?.external_id ?? (typeof fromMetadata === 'string' ? fromMetadata : null),
    customerId: data.customer_id ?? null,
  };
}

function parseData<T extends z.ZodType>(schema: T, type: string, data: unknown): z.infer<T> {
  const parsed = schema.safeParse(data);
  // Not an UnauthorizedError: the signature was good, so this is a payload we cannot read.
  // A 500 makes Polar redeliver and puts the failure in the logs instead of dropping money.
  if (!parsed.success) throw new Error(`Polar ${type} payload is not in the expected shape`);
  return parsed.data;
}

/**
 * Reduces one verified Polar delivery to what changes a plan (JEF-432). Anything
 * Polar sends that Trakwyn does not act on is `ignored`, so a new event type
 * never makes a delivery fail. `passMonths` maps a one-off product id to the
 * months it buys.
 *
 * - `subscription.active` starts a plan; `subscription.uncanceled` does the
 *   same, which clears the end date a cancellation set.
 * - `subscription.canceled` ends it at the end of the paid period.
 *   `subscription.revoked`, which Polar sends when payment retries run out, ends
 *   it at `ended_at`. `past_due` changes nothing: Pro continues while Polar retries.
 * - A paid one-off order is a pass. A subscription's own orders (first or
 *   renewal) are ignored, so a renewal never extends anything.
 * - A fully refunded order reverses the plan it bought. Polar has no dispute
 *   event; a lost dispute is expected to arrive as a refund.
 */
export function mapPolarEvent(
  eventId: string,
  payload: unknown,
  passMonths: ReadonlyMap<string, 3 | 6>,
): BillingWebhookEvent {
  const { type, timestamp, data } = parseData(envelopeSchema, 'webhook', payload);

  switch (type) {
    case POLAR.EVENT.SUBSCRIPTION_ACTIVE:
    case POLAR.EVENT.SUBSCRIPTION_UNCANCELED: {
      const sub = parseData(subscriptionSchema, type, data);
      return { id: eventId, ...ownerOf(sub), kind: 'subscription_started', subscriptionId: sub.id };
    }

    case POLAR.EVENT.SUBSCRIPTION_CANCELED: {
      const sub = parseData(subscriptionSchema, type, data);
      const endsAt = sub.ends_at ?? sub.current_period_end ?? timestamp;
      if (!endsAt) throw new Error(`Polar ${type} payload names no end date`);
      return {
        id: eventId,
        ...ownerOf(sub),
        kind: 'subscription_cancelled',
        subscriptionId: sub.id,
        endsAt,
      };
    }

    case POLAR.EVENT.SUBSCRIPTION_REVOKED: {
      const sub = parseData(subscriptionSchema, type, data);
      const endsAt = sub.ended_at ?? sub.ends_at ?? timestamp;
      if (!endsAt) throw new Error(`Polar ${type} payload names no end date`);
      return {
        id: eventId,
        ...ownerOf(sub),
        kind: 'subscription_cancelled',
        subscriptionId: sub.id,
        endsAt,
      };
    }

    case POLAR.EVENT.ORDER_PAID: {
      const order = parseData(orderSchema, type, data);
      if (order.subscription_id || order.billing_reason !== POLAR.ORDER_BILLING_REASON_PURCHASE) {
        return { id: eventId, ...ownerOf(order), kind: 'ignored' };
      }
      const months = order.product_id ? passMonths.get(order.product_id) : undefined;
      if (!months) {
        throw new Error(
          `Polar order ${order.id} paid for one-off product ${order.product_id ?? 'none'}, which is not a pass`,
        );
      }
      return { id: eventId, ...ownerOf(order), kind: 'pass_purchased', months };
    }

    case POLAR.EVENT.ORDER_REFUNDED: {
      const order = parseData(orderSchema, type, data);
      if (order.status !== POLAR.ORDER_STATUS_REFUNDED) {
        return { id: eventId, ...ownerOf(order), kind: 'ignored' };
      }
      return {
        id: eventId,
        ...ownerOf(order),
        kind: 'payment_reversed',
        product: order.subscription_id ? 'subscription' : 'pass',
        subscriptionId: order.subscription_id ?? null,
      };
    }

    default:
      return { id: eventId, userId: null, customerId: null, kind: 'ignored' };
  }
}
