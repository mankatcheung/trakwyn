import type { IBillingProvider } from '#src/use-cases/ports/IBillingProvider.js';
import { BILLING_ADAPTER, ENV, NODE_ENV, POLAR } from '#src/infrastructure/config/constants.js';
import { FakeBillingProvider } from '#src/infrastructure/billing/FakeBillingProvider.js';
import { PolarBillingProvider } from '#src/infrastructure/billing/PolarBillingProvider.js';

const POLAR_SETTINGS = [
  ENV.POLAR_ACCESS_TOKEN,
  ENV.POLAR_WEBHOOK_SECRET,
  ENV.POLAR_SERVER,
  ENV.POLAR_PRODUCT_MONTHLY,
  ENV.POLAR_PRODUCT_FOUNDER_MONTHLY,
  ENV.POLAR_PRODUCT_PASS_3M,
  ENV.POLAR_PRODUCT_PASS_6M,
] as const;

/**
 * `BILLING_PROVIDER` when set, else the fake outside production. Production
 * with nothing set throws on first use instead of quietly taking no money, and
 * so does `polar` with any of its settings missing — the same shape as
 * `buildCaptchaVerifier`. `POLAR_SERVER` has no default, so a live token is
 * never used against the sandbox, or the reverse, by omission.
 */
export function buildBillingProvider(): IBillingProvider {
  const configured = process.env[ENV.BILLING_PROVIDER]?.trim();
  const provider =
    configured ||
    (process.env[ENV.NODE_ENV] === NODE_ENV.PRODUCTION ? '' : BILLING_ADAPTER.PROVIDER.FAKE);

  if (provider === BILLING_ADAPTER.PROVIDER.FAKE) return new FakeBillingProvider();
  if (provider === BILLING_ADAPTER.PROVIDER.POLAR) return buildPolar();
  throw new Error(
    `${ENV.BILLING_PROVIDER} must be "${BILLING_ADAPTER.PROVIDER.FAKE}" or "${BILLING_ADAPTER.PROVIDER.POLAR}", got "${provider}"`,
  );
}

function buildPolar(): PolarBillingProvider {
  const value = (name: (typeof POLAR_SETTINGS)[number]): string => process.env[name]?.trim() ?? '';

  const missing = POLAR_SETTINGS.filter((name) => !value(name));
  if (missing.length > 0) {
    throw new Error(
      `${ENV.BILLING_PROVIDER}=${BILLING_ADAPTER.PROVIDER.POLAR} needs ${missing.join(', ')}`,
    );
  }

  const server = value(ENV.POLAR_SERVER);
  if (server !== POLAR.SERVER.SANDBOX && server !== POLAR.SERVER.PRODUCTION) {
    throw new Error(
      `${ENV.POLAR_SERVER} must be "${POLAR.SERVER.SANDBOX}" or "${POLAR.SERVER.PRODUCTION}", got "${server}"`,
    );
  }

  return new PolarBillingProvider({
    accessToken: value(ENV.POLAR_ACCESS_TOKEN),
    webhookSecret: value(ENV.POLAR_WEBHOOK_SECRET),
    server,
    products: {
      monthly: value(ENV.POLAR_PRODUCT_MONTHLY),
      founder_monthly: value(ENV.POLAR_PRODUCT_FOUNDER_MONTHLY),
      pass_3m: value(ENV.POLAR_PRODUCT_PASS_3M),
      pass_6m: value(ENV.POLAR_PRODUCT_PASS_6M),
    },
  });
}
