import { describe, expect, it } from 'vitest';
import { planStatus, usageLevel, usagePercent, type BillingStatus } from '#/lib/billingStatus';

const FEATURES = {
  notifications: false,
  analytics: false,
  offers: false,
  shareLinks: false,
  apiAccess: false,
};
const LIMITS = { applications: 50, documentBytes: 100, aiActionsPerMonth: 5 };

const status = (overrides: Partial<BillingStatus> = {}): BillingStatus => ({
  enforced: true,
  plan: 'free',
  planExpiresAt: null,
  planSource: null,
  features: FEATURES,
  limits: LIMITS,
  catalogue: {
    free: { features: FEATURES, limits: LIMITS },
    pro: {
      features: { ...FEATURES, analytics: true },
      limits: { applications: null, documentBytes: 200, aiActionsPerMonth: null },
    },
  },
  usage: { applications: 0, documentBytes: 0, aiActionsThisMonth: 0 },
  ...overrides,
});

describe('usageLevel', () => {
  it('is unlimited when there is no limit', () => {
    expect(usageLevel(10_000, null)).toBe('unlimited');
  });

  it('is ok below 80%, warning from 80%, full at the limit', () => {
    expect(usageLevel(39, 50)).toBe('ok');
    expect(usageLevel(40, 50)).toBe('warning');
    expect(usageLevel(49, 50)).toBe('warning');
    expect(usageLevel(50, 50)).toBe('full');
    expect(usageLevel(60, 50)).toBe('full');
  });

  it('is full for a limit of zero, which nothing fits under', () => {
    expect(usageLevel(0, 0)).toBe('full');
  });
});

describe('usagePercent', () => {
  it('rounds down to 99 until the limit is actually reached', () => {
    expect(usagePercent(497, 500)).toBe(99);
    expect(usagePercent(500, 500)).toBe(100);
  });

  it('is 0 with nothing used, and for no limit', () => {
    expect(usagePercent(0, 50)).toBe(0);
    expect(usagePercent(10, null)).toBe(0);
  });
});

describe('planStatus', () => {
  it('says every feature is included when plans are not enforced', () => {
    expect(planStatus(status({ enforced: false }))).toEqual({ key: 'plan.statusNotEnforced' });
  });

  it('describes a Free user', () => {
    expect(planStatus(status())).toEqual({ key: 'plan.statusFree' });
  });

  it('describes a subscription, which has no end date', () => {
    expect(planStatus(status({ plan: 'pro', planSource: 'subscription' }))).toEqual({
      key: 'plan.statusSubscription',
    });
  });

  it.each([
    ['pass', 'plan.statusPass'],
    ['trial', 'plan.statusTrial'],
    ['grant', 'plan.statusGrantUntil'],
  ] as const)('gives a %s its end date', (planSource, key) => {
    expect(
      planStatus(status({ plan: 'pro', planSource, planExpiresAt: '2026-12-01T00:00:00.000Z' })),
    ).toEqual({ key, date: '2026-12-01T00:00:00.000Z' });
  });

  it('describes a grant that never ends', () => {
    expect(planStatus(status({ plan: 'pro', planSource: 'grant' }))).toEqual({
      key: 'plan.statusGrant',
    });
  });
});
