/** What a user can ask to buy. The API, not the client, decides which price that means. */
export type CheckoutPlan = 'monthly' | 'pass_3m' | 'pass_6m';

/** A product in the payment provider. `founder_monthly` is picked by the API for eligible users only. */
export type BillingProduct = CheckoutPlan | 'founder_monthly';

/** Whole months a pass adds. */
export const PASS_MONTHS: Readonly<Record<'pass_3m' | 'pass_6m', 3 | 6>> = {
  pass_3m: 3,
  pass_6m: 6,
};

/**
 * What a payment provider told us, reduced to what changes a plan. Every
 * adapter maps its own event names onto these, so no use case knows a provider.
 */
export type BillingWebhookEvent = {
  /** The provider's id for this delivery's event; a replay carries the same one. */
  id: string;
  /** The Trakwyn user id the checkout was created for, when the provider echoed it back. */
  userId: string | null;
  customerId: string | null;
} & (
  | { kind: 'subscription_started'; subscriptionId: string }
  | { kind: 'pass_purchased'; months: 3 | 6 }
  | { kind: 'subscription_cancelled'; subscriptionId: string; endsAt: Date }
  | { kind: 'payment_reversed'; product: 'subscription' | 'pass'; subscriptionId: string | null }
  | { kind: 'ignored' }
);
