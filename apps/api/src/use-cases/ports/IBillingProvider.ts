import type { BillingProduct, BillingWebhookEvent } from '#src/domain/billing/Billing.js';

export interface CreateCheckoutSessionData {
  userId: string;
  email: string;
  product: BillingProduct;
  /** The provider's customer for this user, when they have bought before. */
  customerId: string | null;
  /** Where the provider sends the browser after a successful payment. */
  successUrl: string;
}

/**
 * A payment provider that is the merchant of record (JEF-426). Adapters live
 * in `infrastructure/billing/`; nothing outside them names a provider.
 */
export interface IBillingProvider {
  createCheckoutSession(data: CreateCheckoutSessionData): Promise<{ url: string }>;

  /** The provider's hosted page where a customer manages or cancels. */
  createPortalSession(data: { customerId: string; returnUrl: string }): Promise<{ url: string }>;

  /**
   * Checks the signature over the exact bytes received, then parses.
   * Throws `UnauthorizedError` when the signature is missing or wrong.
   */
  parseWebhook(
    rawBody: Buffer,
    headers: Record<string, string | string[] | undefined>,
  ): BillingWebhookEvent;
}
