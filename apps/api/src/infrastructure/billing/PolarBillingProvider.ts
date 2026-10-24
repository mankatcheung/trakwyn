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
    return checkoutResponse.parse(await this.post('/checkouts/', body));
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
   * field names with Polar's messages. Never the values: the body can echo what we
   * sent, an email address among it.
   */
  private async post(path: string, body: unknown): Promise<unknown> {
    const res = await this.fetchImpl(`${this.baseUrl}${path}`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.deps.accessToken}`,
        'Polar-Version': POLAR.API_VERSION,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(POLAR.REQUEST_TIMEOUT_MS),
    });
    if (!res.ok) {
      throw new Error(`Polar answered ${res.status} for POST ${path}${await describeRefusal(res)}`);
    }
    return res.json();
  }
}

const validationProblems = z.array(
  z.object({ loc: z.array(z.union([z.string(), z.number()])), msg: z.string() }),
);

/** `: body.field: message; …` from a validation error's `detail`, or nothing if it has none. */
async function describeRefusal(res: Response): Promise<string> {
  const body: unknown = await res.json().catch(() => null);
  const detail = z.object({ detail: validationProblems }).safeParse(body);
  if (!detail.success) return '';
  const problems = detail.data.detail
    .slice(0, POLAR.MAX_REPORTED_PROBLEMS)
    .map(
      (problem) => `${problem.loc.join('.')}: ${problem.msg.slice(0, POLAR.MAX_PROBLEM_LENGTH)}`,
    );
  return problems.length > 0 ? `: ${problems.join('; ')}` : '';
}

/** A header that arrived exactly once, else undefined. */
function single(value: string | string[] | undefined): string | undefined {
  return typeof value === 'string' ? value : undefined;
}
