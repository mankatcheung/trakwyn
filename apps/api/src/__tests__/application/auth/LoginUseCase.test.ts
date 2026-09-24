import { describe, it, expect, vi, beforeEach } from 'vitest';
import bcrypt from 'bcryptjs';
import { LoginUseCase } from '#src/use-cases/auth/LoginUseCase.js';
import { makeLoginEventRepository } from '#src/__tests__/helpers/mocks/auth.js';
import { makeUser, makeUserRepository } from '#src/__tests__/helpers/mocks/user.js';
import { makeLogger } from '#src/__tests__/helpers/mocks/infrastructure.js';
import type { ILogger } from '#src/use-cases/ports/ILogger.js';

vi.mock('bcryptjs', () => ({
  default: {
    hash: vi.fn(),
    compare: vi.fn(),
  },
}));

describe('LoginUseCase', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const makeDeps = (overrides?: object) => ({
    userRepository: makeUserRepository(),
    loginEventRepository: makeLoginEventRepository(),
    generateId: vi.fn().mockReturnValue('event-1'),
    logger: makeLogger(),
    ...overrides,
  });

  const warnFields = (logger: ILogger) => vi.mocked(logger.warn).mock.calls.map(([, , f]) => f);

  it('returns the user when credentials are valid', async () => {
    const user = makeUser();
    const loginEventRepository = makeLoginEventRepository();
    const deps = makeDeps({
      userRepository: makeUserRepository({ findByEmail: vi.fn().mockResolvedValue(user) }),
      loginEventRepository,
    });
    vi.mocked(bcrypt.compare).mockResolvedValue(true as never);

    const useCase = new LoginUseCase(deps);
    const result = await useCase.execute({
      email: 'test@example.com',
      password: 'password123',
      ipAddress: '127.0.0.1',
      userAgent: 'test-agent',
    });

    expect(result).toEqual(user);
    expect(deps.logger.warn).not.toHaveBeenCalled();
    expect(vi.mocked(bcrypt.compare)).toHaveBeenCalledWith('password123', user.passwordHash);
    expect(loginEventRepository.create).toHaveBeenCalledWith({
      id: 'event-1',
      userId: user.id,
      ipAddress: '127.0.0.1',
      userAgent: 'test-agent',
    });
  });

  it('records a login event with null ip/userAgent when not provided', async () => {
    const user = makeUser();
    const loginEventRepository = makeLoginEventRepository();
    const deps = makeDeps({
      userRepository: makeUserRepository({ findByEmail: vi.fn().mockResolvedValue(user) }),
      loginEventRepository,
    });
    vi.mocked(bcrypt.compare).mockResolvedValue(true as never);

    const useCase = new LoginUseCase(deps);
    await useCase.execute({ email: 'test@example.com', password: 'password123' });

    expect(loginEventRepository.create).toHaveBeenCalledWith({
      id: 'event-1',
      userId: user.id,
      ipAddress: null,
      userAgent: null,
    });
  });

  it('throws USER_NOT_FOUND when user is not found', async () => {
    const loginEventRepository = makeLoginEventRepository();
    const deps = makeDeps({
      userRepository: makeUserRepository({ findByEmail: vi.fn().mockResolvedValue(null) }),
      loginEventRepository,
    });

    const useCase = new LoginUseCase(deps);
    const err = await useCase
      .execute({ email: 'nobody@example.com', password: 'pass' })
      .catch((e) => e);

    expect(err).toBeInstanceOf(Error);
    expect((err as { code: string }).code).toBe('USER_NOT_FOUND');
    expect(vi.mocked(bcrypt.compare)).not.toHaveBeenCalled();
    expect(loginEventRepository.create).not.toHaveBeenCalled();
    expect(warnFields(deps.logger)).toEqual([
      { event: 'auth.login.failed', reason: 'invalid_credentials', userId: undefined },
    ]);
  });

  it('throws UNAUTHORIZED when password does not match', async () => {
    const loginEventRepository = makeLoginEventRepository();
    const deps = makeDeps({
      userRepository: makeUserRepository({ findByEmail: vi.fn().mockResolvedValue(makeUser()) }),
      loginEventRepository,
    });
    vi.mocked(bcrypt.compare).mockResolvedValue(false as never);

    const useCase = new LoginUseCase(deps);
    const err = await useCase
      .execute({
        email: 'test@example.com',
        password: 'wrong',
        ipAddress: '203.0.113.9',
        userAgent: 'test-agent',
      })
      .catch((e) => e);

    expect(err).toBeInstanceOf(Error);
    expect((err as { code: string }).code).toBe('UNAUTHORIZED');
    expect(loginEventRepository.create).not.toHaveBeenCalled();
    // Indistinguishable from an unknown email: same reason, no user id.
    expect(warnFields(deps.logger)).toEqual([
      { event: 'auth.login.failed', reason: 'invalid_credentials', userId: undefined },
    ]);
    const logged = JSON.stringify(vi.mocked(deps.logger.warn).mock.calls);
    for (const pii of ['test@example.com', 'wrong', '203.0.113.9', 'test-agent']) {
      expect(logged).not.toContain(pii);
    }
  });

  it('throws UNAUTHORIZED (not a bcrypt crash) for an OAuth-only account with no password', async () => {
    const loginEventRepository = makeLoginEventRepository();
    const deps = makeDeps({
      userRepository: makeUserRepository({
        findByEmail: vi.fn().mockResolvedValue(makeUser({ passwordHash: null })),
      }),
      loginEventRepository,
    });

    const useCase = new LoginUseCase(deps);
    const err = await useCase
      .execute({ email: 'test@example.com', password: 'anything' })
      .catch((e) => e);

    expect((err as { code: string }).code).toBe('UNAUTHORIZED');
    expect(vi.mocked(bcrypt.compare)).not.toHaveBeenCalled();
    expect(loginEventRepository.create).not.toHaveBeenCalled();
    expect(warnFields(deps.logger)).toEqual([
      { event: 'auth.login.failed', reason: 'no_password', userId: undefined },
    ]);
  });
});
