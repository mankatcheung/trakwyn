import { describe, it, expect, afterEach, vi } from 'vitest';
import { buildBillingProvider } from '#src/infrastructure/billing/buildBillingProvider.js';
import { FakeBillingProvider } from '#src/infrastructure/billing/FakeBillingProvider.js';
import { PolarBillingProvider } from '#src/infrastructure/billing/PolarBillingProvider.js';

const POLAR_ENV = {
  BILLING_PROVIDER: 'polar',
  POLAR_ACCESS_TOKEN: 'polar_oat_test',
  POLAR_WEBHOOK_SECRET: 'whsec_dGVzdA==',
  POLAR_SERVER: 'sandbox',
  POLAR_PRODUCT_MONTHLY: 'prod-monthly',
  POLAR_PRODUCT_FOUNDER_MONTHLY: 'prod-founder',
  POLAR_PRODUCT_PASS_3M: 'prod-pass-3m',
  POLAR_PRODUCT_PASS_6M: 'prod-pass-6m',
} as const;

const stub = (env: Record<string, string | undefined>) => {
  for (const key of [...Object.keys(POLAR_ENV), 'NODE_ENV']) vi.stubEnv(key, undefined);
  for (const [key, value] of Object.entries(env)) vi.stubEnv(key, value);
};

afterEach(() => vi.unstubAllEnvs());

describe('buildBillingProvider', () => {
  it('is the fake outside production when nothing is set', () => {
    stub({});
    expect(buildBillingProvider()).toBeInstanceOf(FakeBillingProvider);
  });

  it('throws in production when nothing is set, rather than taking no money', () => {
    stub({ NODE_ENV: 'production' });
    expect(() => buildBillingProvider()).toThrow(/BILLING_PROVIDER/);
  });

  it('rejects a name it does not know', () => {
    stub({ BILLING_PROVIDER: 'stripe' });
    expect(() => buildBillingProvider()).toThrow(/"fake" or "polar"/);
  });

  it('builds the Polar adapter when every setting is present', () => {
    stub(POLAR_ENV);
    expect(buildBillingProvider()).toBeInstanceOf(PolarBillingProvider);
  });

  it.each(Object.keys(POLAR_ENV).filter((key) => key !== 'BILLING_PROVIDER'))(
    'names %s when it is missing, so a half-configured Polar fails on first use',
    (missing) => {
      stub({ ...POLAR_ENV, [missing]: '  ' });
      expect(() => buildBillingProvider()).toThrow(new RegExp(missing));
    },
  );

  it('lists every missing setting at once', () => {
    stub({ BILLING_PROVIDER: 'polar' });
    expect(() => buildBillingProvider()).toThrow(
      /POLAR_ACCESS_TOKEN.*POLAR_WEBHOOK_SECRET.*POLAR_SERVER/,
    );
  });

  it('refuses a POLAR_SERVER that is neither sandbox nor production', () => {
    stub({ ...POLAR_ENV, POLAR_SERVER: 'live' });
    expect(() => buildBillingProvider()).toThrow(/POLAR_SERVER must be "sandbox" or "production"/);
  });
});
