import { describe, expect, it } from 'vitest';
import { effectivePlan } from '#src/domain/plan/Plan.js';
import { resolveEntitlements } from '#src/use-cases/plans/resolveEntitlements.js';
import { CONTENT_LIMITS, PLAN_LIMITS } from '#src/use-cases/constants.js';

const NOW = new Date('2026-11-01T12:00:00.000Z');
const FUTURE = new Date('2026-12-01T12:00:00.000Z');
const PAST = new Date('2026-10-01T12:00:00.000Z');

describe('effectivePlan', () => {
  it('keeps free as free', () => {
    expect(effectivePlan('free', null, NOW)).toBe('free');
  });

  it('keeps a pro plan with no expiry (an active subscription)', () => {
    expect(effectivePlan('pro', null, NOW)).toBe('pro');
  });

  it('keeps a pro plan that has not expired yet', () => {
    expect(effectivePlan('pro', FUTURE, NOW)).toBe('pro');
  });

  it('resolves a pro plan to free the moment it expires', () => {
    expect(effectivePlan('pro', NOW, NOW)).toBe('free');
    expect(effectivePlan('pro', PAST, NOW)).toBe('free');
  });

  it('ignores an expiry on a free plan', () => {
    expect(effectivePlan('free', FUTURE, NOW)).toBe('free');
  });
});

describe('resolveEntitlements', () => {
  it('gives a free user no Pro features', () => {
    const entitlements = resolveEntitlements('free', null, NOW);

    expect(entitlements.plan).toBe('free');
    expect(entitlements.features).toEqual({
      notifications: false,
      analytics: false,
      offers: false,
      shareLinks: false,
      apiAccess: false,
    });
  });

  it('gives a pro user every Pro feature', () => {
    const entitlements = resolveEntitlements('pro', null, NOW);

    expect(entitlements.plan).toBe('pro');
    expect(Object.values(entitlements.features).every(Boolean)).toBe(true);
  });

  it('gives a free user the limits the system already enforced before plans existed', () => {
    const { limits } = resolveEntitlements('free', null, NOW);

    expect(limits.applications).toBe(CONTENT_LIMITS.APPLICATIONS_PER_USER);
    expect(limits.documentBytes).toBe(CONTENT_LIMITS.DOCUMENT_STORAGE_LIMIT_BYTES);
    expect(limits.aiActionsPerMonth).toBe(PLAN_LIMITS.free.aiActionsPerMonth);
  });

  it('gives a pro user no application cap, 2 GB of documents and unlimited AI', () => {
    const { limits } = resolveEntitlements('pro', null, NOW);

    expect(limits.applications).toBeNull();
    expect(limits.documentBytes).toBe(2 * 1024 * 1024 * 1024);
    expect(limits.aiActionsPerMonth).toBeNull();
  });

  it('states the free AI allowance as five actions a month', () => {
    expect(resolveEntitlements('free', null, NOW).limits.aiActionsPerMonth).toBe(5);
  });

  it('resolves an expired pass to the free entitlements', () => {
    expect(resolveEntitlements('pro', PAST, NOW)).toEqual(resolveEntitlements('free', null, NOW));
  });

  it('keeps pro entitlements until the expiry instant', () => {
    expect(resolveEntitlements('pro', FUTURE, NOW).plan).toBe('pro');
  });
});
