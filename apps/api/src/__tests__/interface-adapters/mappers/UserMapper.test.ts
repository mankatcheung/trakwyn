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
