import { describe, expect, it, vi } from 'vitest';
import { EntitlementService } from '#src/use-cases/plans/EntitlementService.js';
import { CONTENT_LIMITS, PLAN_LIMITS } from '#src/use-cases/constants.js';
import { NotFoundError, PlanRequiredError } from '#src/use-cases/errors/DomainError.js';
import { makeUser, makeUserRepository } from '../../helpers/mocks/user.js';

const NOW = new Date('2026-11-01T12:00:00.000Z');
const FUTURE = new Date('2026-12-01T12:00:00.000Z');
const PAST = new Date('2026-10-01T12:00:00.000Z');

function makeService(plansEnforced: boolean, user = makeUser()) {
  const userRepository = makeUserRepository({ findById: vi.fn().mockResolvedValue(user) });
  const service = new EntitlementService({ userRepository, plansEnforced, now: () => NOW });
  return { service, userRepository };
}

describe('EntitlementService', () => {
  describe('with plans not enforced (the default, and every self-hosted instance)', () => {
    it('gives a Free user every feature and unlimited AI', () => {
      const { service } = makeService(false);

      const entitlements = service.forUser(makeUser({ plan: 'free' }));

      expect(Object.values(entitlements.features).every(Boolean)).toBe(true);
      expect(entitlements.limits.aiActionsPerMonth).toBeNull();
    });

    it('keeps the caps the system enforced before plans existed', () => {
      const { service } = makeService(false);

      const { limits } = service.forUser(makeUser({ plan: 'free' }));

      expect(limits.applications).toBe(CONTENT_LIMITS.APPLICATIONS_PER_USER);
      expect(limits.documentBytes).toBe(CONTENT_LIMITS.DOCUMENT_STORAGE_LIMIT_BYTES);
    });

    it('never refuses a feature', async () => {
      const { service } = makeService(false);

      await expect(service.assertFeature('user-1', 'analytics')).resolves.toBeUndefined();
    });
  });

  describe('with plans enforced', () => {
    it('gives a Free user the Free entitlements', () => {
      const { service } = makeService(true);

      const entitlements = service.forUser(makeUser({ plan: 'free' }));

      expect(entitlements.plan).toBe('free');
      expect(entitlements.features.analytics).toBe(false);
      expect(entitlements.limits.aiActionsPerMonth).toBe(PLAN_LIMITS.free.aiActionsPerMonth);
    });

    it('gives an active Pro subscription the Pro entitlements', () => {
      const { service } = makeService(true);

      const entitlements = service.forUser(
        makeUser({ plan: 'pro', planSource: 'subscription', planExpiresAt: null }),
      );

      expect(entitlements.plan).toBe('pro');
      expect(entitlements.limits.applications).toBeNull();
    });

    it('gives a pass that has not ended yet the Pro entitlements', () => {
      const { service } = makeService(true);

      const entitlements = service.forUser(
        makeUser({ plan: 'pro', planSource: 'pass', planExpiresAt: FUTURE }),
      );

      expect(entitlements.plan).toBe('pro');
    });

    it('drops an expired pass back to Free', () => {
      const { service } = makeService(true);

      const entitlements = service.forUser(
        makeUser({ plan: 'pro', planSource: 'pass', planExpiresAt: PAST }),
      );

      expect(entitlements.plan).toBe('free');
      expect(entitlements.features.shareLinks).toBe(false);
    });

    it('loads the user by id', async () => {
      const { service, userRepository } = makeService(true, makeUser({ plan: 'pro' }));

      const entitlements = await service.forUserId('user-1');

      expect(userRepository.findById).toHaveBeenCalledWith('user-1');
      expect(entitlements.plan).toBe('pro');
    });

    it('fails with NotFoundError for a user that no longer exists', async () => {
      const userRepository = makeUserRepository({ findById: vi.fn().mockResolvedValue(null) });
      const service = new EntitlementService({
        userRepository,
        plansEnforced: true,
        now: () => NOW,
      });

      await expect(service.forUserId('gone')).rejects.toBeInstanceOf(NotFoundError);
    });

    it('refuses a Pro feature for a Free user with PlanRequiredError', async () => {
      const { service } = makeService(true);

      await expect(service.assertFeature('user-1', 'analytics')).rejects.toBeInstanceOf(
        PlanRequiredError,
      );
    });

    it('says which feature needs Pro', async () => {
      const { service } = makeService(true);

      await expect(service.assertFeature('user-1', 'shareLinks')).rejects.toThrow(/share links/i);
    });

    it('lets a Pro user use a Pro feature', async () => {
      const { service } = makeService(true, makeUser({ plan: 'pro', planExpiresAt: null }));

      await expect(service.assertFeature('user-1', 'offers')).resolves.toBeUndefined();
    });

    it('refuses again once the pass has expired', async () => {
      const { service } = makeService(
        true,
        makeUser({ plan: 'pro', planSource: 'pass', planExpiresAt: PAST }),
      );

      await expect(service.assertFeature('user-1', 'offers')).rejects.toBeInstanceOf(
        PlanRequiredError,
      );
    });
  });

  it('reports whether plans are enforced', () => {
    expect(makeService(true).service.enforced).toBe(true);
    expect(makeService(false).service.enforced).toBe(false);
  });
});
