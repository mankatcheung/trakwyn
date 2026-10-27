import { describe, it, expect, vi } from 'vitest';
import { UserMapper } from '#src/interface-adapters/mappers/UserMapper.js';
import { CONTENT_LIMITS, PLAN_LIMITS } from '#src/use-cases/constants.js';
import { makeUser } from '#src/__tests__/helpers/mocks/user.js';
import {
  makeEntitlements,
  makeEntitlementService,
  makeFreeEntitlements,
} from '#src/__tests__/helpers/mocks/plans.js';

describe('UserMapper storage fields (JEF-425)', () => {
  const mapper = new UserMapper({
    entitlementService: makeEntitlementService({
      forUser: vi.fn().mockReturnValue(makeFreeEntitlements()),
    }),
  });

  it('reports the stored bytes and the storage limit', () => {
    const dto = mapper.toDTO(makeUser({ documentBytes: 4_200_000 }), null);

    expect(dto.storageUsedBytes).toBe(4_200_000);
    expect(dto.storageLimitBytes).toBe(CONTENT_LIMITS.DOCUMENT_STORAGE_LIMIT_BYTES);
  });

  it('reports the limit of the plan the user is on (JEF-344)', () => {
    const proMapper = new UserMapper({
      entitlementService: makeEntitlementService({
        forUser: vi.fn().mockReturnValue(makeEntitlements()),
      }),
    });

    expect(proMapper.toDTO(makeUser({ plan: 'pro' }), null).storageLimitBytes).toBe(
      PLAN_LIMITS.pro.documentBytes,
    );
  });
});

describe('UserMapper emailVerified (JEF-438)', () => {
  const entitlementService = makeEntitlementService({
    forUser: vi.fn().mockReturnValue(makeFreeEntitlements()),
  });
  const unverified = makeUser({ emailVerifiedAt: null });

  it('reports an unverified address as unverified', () => {
    expect(new UserMapper({ entitlementService }).toDTO(unverified, null).emailVerified).toBe(
      false,
    );
  });

  it('reports a verified address as verified', () => {
    const dto = new UserMapper({ entitlementService }).toDTO(
      makeUser({ emailVerifiedAt: new Date() }),
      null,
    );

    expect(dto.emailVerified).toBe(true);
  });

  it('reports everyone as verified when the wall is switched off, so no client shows it', () => {
    const mapper = new UserMapper({ entitlementService, emailVerificationRequired: false });

    expect(mapper.toDTO(unverified, null).emailVerified).toBe(true);
  });
});
