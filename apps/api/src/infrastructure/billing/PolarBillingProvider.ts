import { Webhook, WebhookVerificationError } from 'standardwebhooks';
import { z } from 'zod';
import type { BillingProduct, BillingWebhookEvent } from '#src/domain/billing/Billing.js';
import { PASS_MONTHS } from '#src/domain/billing/Billing.js';
import { UnauthorizedError } from '#src/use-cases/errors/DomainError.js';
import type {
  CreateCheckoutSessionData,
  IBillingProvider,
} from '#src/use-cases/ports/IBillingProvider.js';
import { POLAR } from '#src/infrastructure/config/constants.js';
import { mapPolarEvent } from '#src/infrastructure/billing/polarWebhookEvents.js';

export interface PolarBillingProviderDeps {
  accessToken: string;
  /** The `whsec_…` secret of the webhook endpoint registered for this environment. */
  webhookSecret: string;
  server: 'sandbox' | 'production';
  /** The Polar product id for each Trakwyn product. */
  products: Readonly<Record<BillingProduct, string>>;
  fetchImpl?: typeof fetch;
}

const checkoutResponse = z.object({ url: z.string().url() });
const portalResponse = z.object({ customer_portal_url: z.string().url() });

/**
 * Polar as the merchant of record (JEF-426, JEF-432). Plain `fetch` against
 * Polar's REST API, pinned to one `Polar-Version`, and Standard Webhooks for the
 * signature, rather than its SDK, which is versioned by import path and would
 * move the payload shapes under us. The Trakwyn user id goes out as the
 * checkout's external customer id and metadata, and comes back on the order or
 * subscription, so the webhook finds the user.
 */
export class PolarBillingProvider implements IBillingProvider {
  private readonly baseUrl: string;
  private readonly fetchImpl: typeof fetch;
  private readonly webhook: Webhook;
  private readonly passMonths: ReadonlyMap<string, 3 | 6>;

  constructor(private readonly deps: PolarBillingProviderDeps) {
    this.baseUrl = POLAR.API_URL[deps.server];
    this.fetchImpl = deps.fetchImpl ?? fetch;
    this.webhook = new Webhook(deps.webhookSecret);
    this.passMonths = new Map(
      (Object.keys(PASS_MONTHS) as (keyof typeof PASS_MONTHS)[]).map((product) => [
        deps.products[product],
        PASS_MONTHS[product],
      ]),
    );
  }

  async createCheckoutSession(data: CreateCheckoutSessionData): Promise<{ url: string }> {
    const body = {
      products: [this.deps.products[data.product]],
      success_url: data.successUrl,
      metadata: { [POLAR.METADATA_USER_ID]: data.userId },
      // A returning buyer keeps their Polar customer; a new one is created with our id on it.
      ...(data.customerId
        ? { customer_id: data.customerId }
        : { external_customer_id: data.userId, customer_email: data.email }),
    };
    return checkoutResponse.parse(await this.post('/checkouts/', body, [data.email, data.userId]));
  }

  async createPortalSession(data: { customerId: string; returnUrl: string }): Promise<{
    url: string;
  }> {
    const session = portalResponse.parse(
      await this.post('/customer-sessions/', {
        customer_id: data.customerId,
        return_url: data.returnUrl,
      }),
    );
    return { url: session.customer_portal_url };
  }

  /**
   * Ends the subscription now (`DELETE /subscriptions/{id}`, scope `subscriptions:write`),
   * not at the end of the period. Polar answers 403 for one already revoked and 404 for one
   * it does not have; both leave nothing to stop, so they count as done. A 409 means it is
   * pending an update and the same call works shortly after, which the message says.
   */
  async revokeSubscription(subscriptionId: string): Promise<void> {
    const path = `/subscriptions/${encodeURIComponent(subscriptionId)}`;
    const res = await this.fetchImpl(`${this.baseUrl}${path}`, {
      method: 'DELETE',
      headers: this.authHeaders(),
      signal: AbortSignal.timeout(POLAR.REQUEST_TIMEOUT_MS),
    });
    const { ALREADY_REVOKED, NOT_FOUND, PENDING_UPDATE } = POLAR.REVOKE_STATUS;
    if (res.ok || res.status === ALREADY_REVOKED || res.status === NOT_FOUND) return;

    const hint =
      res.status === PENDING_UPDATE
        ? ': the subscription is pending an update, try again shortly'
        : '';
    throw new Error(`Polar answered ${res.status} for DELETE ${path}${hint}`);
  }

  parseWebhook(
    rawBody: Buffer,
    headers: Record<string, string | string[] | undefined>,
  ): BillingWebhookEvent {
    const signed = {
      id: single(headers[POLAR.WEBHOOK_HEADER.ID]),
      timestamp: single(headers[POLAR.WEBHOOK_HEADER.TIMESTAMP]),
      signature: single(headers[POLAR.WEBHOOK_HEADER.SIGNATURE]),
    };
    if (!signed.id || !signed.timestamp || !signed.signature) {
      throw new UnauthorizedError('Invalid webhook signature');
    }

    let payload: unknown;
    try {
      payload = this.webhook.verify(rawBody.toString('utf8'), {
        [POLAR.WEBHOOK_HEADER.ID]: signed.id,
        [POLAR.WEBHOOK_HEADER.TIMESTAMP]: signed.timestamp,
        [POLAR.WEBHOOK_HEADER.SIGNATURE]: signed.signature,
      });
    } catch (err) {
      if (err instanceof WebhookVerificationError) {
        throw new UnauthorizedError('Invalid webhook signature');
      }
      throw err;
    }
    // The delivery id is the event id: Standard Webhooks keeps it across retries, which is
    // what lets the use case recognise a redelivery.
    return mapPolarEvent(signed.id, payload, this.passMonths);
  }

  /**
   * A refusal is reported as the status, the path and, for a validation error, the
   * field names with Polar's messages. Polar's messages can quote what we sent, so
   * every value in `redact` (the buyer's email and user id) is blanked first: the
   * error is logged, and the logs go to Axiom and Cloud Logging, outside the
   * erasure path (JEF-348).
   */
  private async post(
    path: string,
    body: unknown,
    redact: readonly string[] = [],
  ): Promise<unknown> {
    const res = await this.fetchImpl(`${this.baseUrl}${path}`, {
      method: 'POST',
      headers: { ...this.authHeaders(), 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(POLAR.REQUEST_TIMEOUT_MS),
    });
    if (!res.ok) {
      const reason = await describeRefusal(res, redact);
      throw new Error(`Polar answered ${res.status} for POST ${path}${reason}`);
    }
    return res.json();
  }

  private authHeaders(): Record<string, string> {
    return {
      Authorization: `Bearer ${this.deps.accessToken}`,
      'Polar-Version': POLAR.API_VERSION,
    };
  }
}

const validationProblems = z.array(
  z.object({ loc: z.array(z.union([z.string(), z.number()])), msg: z.string() }),
);

/** Every occurrence of each value, whatever its case, as the literal text it is. */
function redacted(text: string, values: readonly string[]): string {
  return values
    .filter((value) => value.length > 0)
    .reduce(
      (safe, value) =>
        safe.replace(
          new RegExp(value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi'),
          POLAR.REDACTED,
        ),
      text,
    );
}

/** `: body.field: message; …` from a validation error's `detail`, or nothing if it has none. */
async function describeRefusal(res: Response, redact: readonly string[]): Promise<string> {
  const body: unknown = await res.json().catch(() => null);
  const detail = z.object({ detail: validationProblems }).safeParse(body);
  if (!detail.success) return '';
  const problems = detail.data.detail.slice(0, POLAR.MAX_REPORTED_PROBLEMS).map((problem) => {
    // Redact before cutting, so a value split by the cut cannot leave its first half behind.
    const message = redacted(problem.msg, redact).slice(0, POLAR.MAX_PROBLEM_LENGTH);
    return `${problem.loc.join('.')}: ${message}`;
  });
  return problems.length > 0 ? `: ${problems.join('; ')}` : '';
}

/** A header that arrived exactly once, else undefined. */
function single(value: string | string[] | undefined): string | undefined {
  return typeof value === 'string' ? value : undefined;
}
