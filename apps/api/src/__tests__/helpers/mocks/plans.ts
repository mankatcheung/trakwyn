/**
 * Test doubles for plans and entitlements (JEF-344).
 *
 * The defaults are the permissive ones (a Pro user, nothing refused), so a
 * test that is not about plans does not have to think about them. A test that
 * is about plans passes `makeFreeEntitlements()` or a refusing `assertFeature`.
 */

import { vi } from 'vitest';
import type { Entitlements } from '#src/domain/plan/Plan.js';
import type { IEntitlementService } from '#src/use-cases/ports/IEntitlementService.js';
import { PLAN_FEATURES, PLAN_LIMITS } from '#src/use-cases/constants.js';
import { PlanRequiredError } from '#src/use-cases/errors/DomainError.js';

export const makeEntitlements = (overrides?: Partial<Entitlements>): Entitlements => ({
  plan: 'pro',
  features: PLAN_FEATURES.pro,
  limits: { ...PLAN_LIMITS.pro },
  ...overrides,
});

export const makeFreeEntitlements = (overrides?: Partial<Entitlements>): Entitlements => ({
  plan: 'free',
  features: PLAN_FEATURES.free,
  limits: { ...PLAN_LIMITS.free },
  ...overrides,
});

export const makeEntitlementService = (
  overrides?: Partial<IEntitlementService>,
): IEntitlementService => ({
  enforced: true,
  forUser: vi.fn().mockReturnValue(makeEntitlements()),
  forUserId: vi.fn().mockResolvedValue(makeEntitlements()),
  assertFeature: vi.fn().mockResolvedValue(undefined),
  ...overrides,
});

/** An entitlement service for a Free user: every `assertFeature` is refused. */
export const makeFreeEntitlementService = (): IEntitlementService =>
  makeEntitlementService({
    forUser: vi.fn().mockReturnValue(makeFreeEntitlements()),
    forUserId: vi.fn().mockResolvedValue(makeFreeEntitlements()),
    assertFeature: vi.fn().mockRejectedValue(new PlanRequiredError('This is a Pro feature')),
  });
