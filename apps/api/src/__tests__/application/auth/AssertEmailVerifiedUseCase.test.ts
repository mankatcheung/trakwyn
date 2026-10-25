import { describe, it, expect, vi } from 'vitest';
import { AssertEmailVerifiedUseCase } from '#src/use-cases/auth/AssertEmailVerifiedUseCase.js';
import { EmailNotVerifiedError } from '#src/use-cases/errors/DomainError.js';
import { ERROR_CODES } from '#src/use-cases/errors/errorCodes.js';
import { makeUser, makeUserRepository } from '#src/__tests__/helpers/mocks/user.js';

describe('AssertEmailVerifiedUseCase', () => {
  it('rejects a user whose email is not verified', async () => {
    const userRepository = makeUserRepository({
      findById: vi.fn().mockResolvedValue(makeUser({ emailVerifiedAt: null })),
    });

    const err = await new AssertEmailVerifiedUseCase({ userRepository })
      .execute('user-1')
      .catch((e) => e);

    expect(err).toBeInstanceOf(EmailNotVerifiedError);
    expect(err.code).toBe(ERROR_CODES.EMAIL_NOT_VERIFIED);
  });

  it('lets a verified user through', async () => {
    const userRepository = makeUserRepository({
      findById: vi.fn().mockResolvedValue(makeUser({ emailVerifiedAt: new Date() })),
    });

    await expect(
      new AssertEmailVerifiedUseCase({ userRepository }).execute('user-1'),
    ).resolves.toBeUndefined();
  });

  it('leaves a missing user to the resolver that needs it', async () => {
    const userRepository = makeUserRepository({ findById: vi.fn().mockResolvedValue(null) });

    await expect(
      new AssertEmailVerifiedUseCase({ userRepository }).execute('gone'),
    ).resolves.toBeUndefined();
  });
});
