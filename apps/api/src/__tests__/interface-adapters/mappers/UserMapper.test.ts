import { describe, it, expect } from 'vitest';
import { UserMapper } from '#src/interface-adapters/mappers/UserMapper.js';
import { CONTENT_LIMITS } from '#src/use-cases/constants.js';
import { makeUser } from '#src/__tests__/helpers/mocks/user.js';

describe('UserMapper storage fields (JEF-425)', () => {
  const mapper = new UserMapper();

  it('reports the stored bytes and the storage limit', () => {
    const dto = mapper.toDTO(makeUser({ documentBytes: 4_200_000 }), null);

    expect(dto.storageUsedBytes).toBe(4_200_000);
    expect(dto.storageLimitBytes).toBe(CONTENT_LIMITS.DOCUMENT_STORAGE_LIMIT_BYTES);
  });
});
