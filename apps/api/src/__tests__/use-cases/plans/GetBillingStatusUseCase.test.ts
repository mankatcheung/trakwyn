import { describe, expect, it, vi } from 'vitest';
import { GetBillingStatusUseCase } from '#src/use-cases/plans/GetBillingStatusUseCase.js';
import { EntitlementService } from '#src/use-cases/plans/EntitlementService.js';
import { NotFoundError } from '#src/use-cases/errors/DomainError.js';
import { PLAN_LIMITS } from '#src/use-cases/constants.js';
import { makeUser, makeUserRepository } from '#src/__tests__/helpers/mocks/user.js';

const NOW = new Date('2026-11-15T12:00:00.000Z');

function build(user = makeUser(), { plansEnforced = true } = {}) {
  const userRepository = makeUserRepository({ findById: vi.fn().mockResolvedValue(user) });
  const entitlementService = new EntitlementService({
    userRepository,
    plansEnforced,
    now: () => NOW,
  });
  const useCase = new GetBillingStatusUseCase({
    userRepository,
    entitlementService,
    now: () => NOW,
  });
  return { useCase };
}

describe('GetBillingStatusUseCase', () => {
  it('reports a Free user with the Free limits and what they have used', async () => {
    const { useCase } = build(makeUser({ applicationCount: 12, documentBytes: 3_000_000 }));

    const status = await useCase.execute({ userId: 'user-1' });

    expect(status).toMatchObject({
      enforced: true,
      plan: 'free',
      planExpiresAt: null,
      planSource: null,
      limits: {
        applications: PLAN_LIMITS.free.applications,
        documentBytes: PLAN_LIMITS.free.documentBytes,
      },
      usage: { applications: 12, documentBytes: 3_000_000 },
    });
    expect(status.features.analytics).toBe(false);
    expect(status.features.mcpAccess).toBe(true);
  });

  it('describes both plans, whichever one the user is on, so a client can compare them', async () => {
    const { useCase } = build(makeUser({ plan: 'pro', planExpiresAt: null }));

    const { catalogue } = await useCase.execute({ userId: 'user-1' });

    expect(catalogue.free.limits).toEqual({ ...PLAN_LIMITS.free });
    expect(catalogue.free.features.analytics).toBe(false);
    expect(catalogue.pro.limits).toEqual({ ...PLAN_LIMITS.pro });
    expect(Object.values(catalogue.pro.features).every(Boolean)).toBe(true);
  });

  it('describes the plans by what they include even when plans are not enforced', async () => {
    const { useCase } = build(makeUser(), { plansEnforced: false });

    const { catalogue } = await useCase.execute({ userId: 'user-1' });

    expect(catalogue.free.features.analytics).toBe(false);
  });

  it('reports a Pro pass with its source and expiry', async () => {
    const expires = new Date('2027-01-15T12:00:00.000Z');
    const { useCase } = build(
      makeUser({ plan: 'pro', planSource: 'pass', planExpiresAt: expires }),
    );

    const status = await useCase.execute({ userId: 'user-1' });

    expect(status.plan).toBe('pro');
    expect(status.planSource).toBe('pass');
    expect(status.planExpiresAt).toEqual(expires);
    expect(status.limits.applications).toBeNull();
    expect(status.features.analytics).toBe(true);
  });

  it('reports the plan a user is on now, not the one stored, once a pass has expired', async () => {
    const { useCase } = build(
      makeUser({
        plan: 'pro',
        planSource: 'pass',
        planExpiresAt: new Date('2026-11-01T00:00:00.000Z'),
      }),
    );

    const status = await useCase.execute({ userId: 'user-1' });

    expect(status.plan).toBe('free');
    expect(status.features.offers).toBe(false);
  });

  it('says plans are not enforced, and unlocks every feature, when they are not', async () => {
    const { useCase } = build(makeUser(), { plansEnforced: false });

    const status = await useCase.execute({ userId: 'user-1' });

    expect(status.enforced).toBe(false);
    expect(Object.values(status.features).every(Boolean)).toBe(true);
  });

  it('fails with NotFoundError for a user that does not exist', async () => {
    const { useCase } = build(null as never);

    await expect(useCase.execute({ userId: 'gone' })).rejects.toBeInstanceOf(NotFoundError);
  });
});
