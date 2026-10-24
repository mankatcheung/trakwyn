import type { IBillingProvider } from '#src/use-cases/ports/IBillingProvider.js';
import { BILLING_ADAPTER, ENV, NODE_ENV } from '#src/infrastructure/config/constants.js';
import { FakeBillingProvider } from '#src/infrastructure/billing/FakeBillingProvider.js';

/**
 * `BILLING_PROVIDER` when set, else the fake outside production. Production
 * with nothing set throws on first use instead of quietly taking no money, and
 * so does a real provider whose credentials are missing — the same shape as
 * `buildCaptchaVerifier`.
 *
 * `polar` is the chosen provider (JEF-426) but its adapter is not written
 * until Polar has accepted Trakwyn and its sandbox is confirmed to cover
 * subscriptions and passes; until then naming it fails loudly.
 */
export function buildBillingProvider(): IBillingProvider {
  const configured = process.env[ENV.BILLING_PROVIDER]?.trim();
  const provider =
    configured ||
    (process.env[ENV.NODE_ENV] === NODE_ENV.PRODUCTION ? '' : BILLING_ADAPTER.PROVIDER.FAKE);

  if (provider === BILLING_ADAPTER.PROVIDER.FAKE) return new FakeBillingProvider();
  if (provider === BILLING_ADAPTER.PROVIDER.POLAR) {
    throw new Error(
      `${ENV.BILLING_PROVIDER}=polar has no adapter yet: it is built once Polar accepts Trakwyn (JEF-426)`,
    );
  }
  throw new Error(
    `${ENV.BILLING_PROVIDER} must be "${BILLING_ADAPTER.PROVIDER.FAKE}" or "${BILLING_ADAPTER.PROVIDER.POLAR}", got "${provider}"`,
  );
}
