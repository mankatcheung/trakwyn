import { describe, it, expect, vi, beforeEach } from 'vitest';
import { RateLimitedError } from '#src/use-cases/errors/DomainError.js';
import { RegisterUseCase } from '#src/use-cases/auth/RegisterUseCase.js';
import { makeUser, makeUserRepository } from '#src/__tests__/helpers/mocks/user.js';
import { makeRateLimiter } from '#src/__tests__/helpers/mocks/infrastructure.js';
import type { ISendEmailVerificationUseCase } from '#src/use-cases/auth/ISendEmailVerificationUseCase.js';

vi.mock('bcryptjs', () => ({
  default: {
    hash: vi.fn().mockResolvedValue('hashed-pw'),
    compare: vi.fn(),
  },
}));

const makeSendEmailVerificationUseCase = (
  overrides?: Partial<ISendEmailVerificationUseCase>,
): ISendEmailVerificationUseCase => ({
  execute: vi.fn().mockResolvedValue(undefined),
  ...overrides,
});

describe('RegisterUseCase', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('registers a new user and returns userId and email', async () => {
    const user = makeUser();
    const userRepository = makeUserRepository({
      findByEmail: vi.fn().mockResolvedValue(null),
      create: vi.fn().mockResolvedValue(user),
    });
    const generateId = vi.fn().mockReturnValue('user-1');

    const useCase = new RegisterUseCase({
      userRepository,
      generateId,
      sendEmailVerificationUseCase: makeSendEmailVerificationUseCase(),
      registerRateLimiter: makeRateLimiter(),
    });
    const result = await useCase.execute({ email: 'test@example.com', password: 'password123' });

    expect(result).toEqual({ userId: 'user-1', email: 'test@example.com' });
    expect(userRepository.create).toHaveBeenCalledWith({
      id: 'user-1',
      email: 'test@example.com',
      passwordHash: 'hashed-pw',
    });
  });

  it('uses generateId for the new user id', async () => {
    const userRepository = makeUserRepository({
      findByEmail: vi.fn().mockResolvedValue(null),
      create: vi.fn().mockResolvedValue(makeUser({ id: 'custom-id' })),
    });
    const generateId = vi.fn().mockReturnValue('custom-id');

    const useCase = new RegisterUseCase({
      userRepository,
      generateId,
      sendEmailVerificationUseCase: makeSendEmailVerificationUseCase(),
      registerRateLimiter: makeRateLimiter(),
    });
    await useCase.execute({ email: 'test@example.com', password: 'password123' });

    expect(generateId).toHaveBeenCalledOnce();
    expect(userRepository.create).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'custom-id' }),
    );
  });

  it('throws CONFLICT when email is already registered', async () => {
    const userRepository = makeUserRepository({
      findByEmail: vi.fn().mockResolvedValue(makeUser()),
    });

    const useCase = new RegisterUseCase({
      userRepository,
      generateId: vi.fn(),
      sendEmailVerificationUseCase: makeSendEmailVerificationUseCase(),
      registerRateLimiter: makeRateLimiter(),
    });
    const err = await useCase
      .execute({ email: 'test@example.com', password: 'password123' })
      .catch((e) => e);

    expect(err).toBeInstanceOf(Error);
    expect((err as { code: string }).code).toBe('CONFLICT');
    expect(userRepository.create).not.toHaveBeenCalled();
  });

  it('throws VALIDATION when the password is too short', async () => {
    const userRepository = makeUserRepository({
      findByEmail: vi.fn().mockResolvedValue(null),
    });

    const useCase = new RegisterUseCase({
      userRepository,
      generateId: vi.fn(),
      sendEmailVerificationUseCase: makeSendEmailVerificationUseCase(),
      registerRateLimiter: makeRateLimiter(),
    });
    const err = await useCase
      .execute({ email: 'test@example.com', password: 'short' })
      .catch((e) => e);

    expect((err as { code: string }).code).toBe('VALIDATION');
    expect(userRepository.findByEmail).not.toHaveBeenCalled();
    expect(userRepository.create).not.toHaveBeenCalled();
  });

  it('sends an email verification for the new user', async () => {
    const user = makeUser({ id: 'user-1' });
    const userRepository = makeUserRepository({
      findByEmail: vi.fn().mockResolvedValue(null),
      create: vi.fn().mockResolvedValue(user),
    });
    const sendEmailVerificationUseCase = makeSendEmailVerificationUseCase();

    const useCase = new RegisterUseCase({
      userRepository,
      generateId: vi.fn().mockReturnValue('user-1'),
      sendEmailVerificationUseCase,
      registerRateLimiter: makeRateLimiter(),
    });
    await useCase.execute({ email: 'test@example.com', password: 'password123' });

    expect(sendEmailVerificationUseCase.execute).toHaveBeenCalledWith('user-1');
  });

  it('still returns successfully when sending the verification email fails', async () => {
    const user = makeUser({ id: 'user-1' });
    const userRepository = makeUserRepository({
      findByEmail: vi.fn().mockResolvedValue(null),
      create: vi.fn().mockResolvedValue(user),
    });
    const sendEmailVerificationUseCase = makeSendEmailVerificationUseCase({
      execute: vi.fn().mockRejectedValue(new Error('Brevo is down')),
    });

    const useCase = new RegisterUseCase({
      userRepository,
      generateId: vi.fn().mockReturnValue('user-1'),
      sendEmailVerificationUseCase,
      registerRateLimiter: makeRateLimiter(),
    });
    const result = await useCase.execute({
      email: 'test@example.com',
      password: 'password123',
    });

    expect(result).toEqual({ userId: 'user-1', email: 'test@example.com' });
  });

  describe('sign-up rate limit (JEF-400)', () => {
    it('rejects with RATE_LIMITED before touching the database or sending mail', async () => {
      const userRepository = makeUserRepository();
      const sendEmailVerificationUseCase = makeSendEmailVerificationUseCase();
      const registerRateLimiter = makeRateLimiter({ consume: vi.fn().mockResolvedValue(false) });

      const useCase = new RegisterUseCase({
        userRepository,
        generateId: vi.fn(),
        sendEmailVerificationUseCase,
        registerRateLimiter,
      });
      const err = await useCase
        .execute({ email: 'a@example.com', password: 'password123', ipAddress: '203.0.113.7' })
        .catch((e) => e);

      expect((err as { code: string }).code).toBe('RATE_LIMITED');
      expect(registerRateLimiter.consume).toHaveBeenCalledWith('register:ip:203.0.113.7');
      expect(userRepository.findByEmail).not.toHaveBeenCalled();
      expect(userRepository.create).not.toHaveBeenCalled();
      expect(sendEmailVerificationUseCase.execute).not.toHaveBeenCalled();
    });

    it('does not consume the limiter when the IP is unknown', async () => {
      const user = makeUser({ id: 'user-1' });
      const registerRateLimiter = makeRateLimiter();

      const useCase = new RegisterUseCase({
        userRepository: makeUserRepository({
          findByEmail: vi.fn().mockResolvedValue(null),
          create: vi.fn().mockResolvedValue(user),
        }),
        generateId: vi.fn().mockReturnValue('user-1'),
        sendEmailVerificationUseCase: makeSendEmailVerificationUseCase(),
        registerRateLimiter,
      });
      await useCase.execute({ email: 'a@example.com', password: 'password123', ipAddress: null });

      expect(registerRateLimiter.consume).not.toHaveBeenCalled();
    });

    it('still creates the account when the verification mail is throttled', async () => {
      const user = makeUser({ id: 'user-1' });
      const useCase = new RegisterUseCase({
        userRepository: makeUserRepository({
          findByEmail: vi.fn().mockResolvedValue(null),
          create: vi.fn().mockResolvedValue(user),
        }),
        generateId: vi.fn().mockReturnValue('user-1'),
        sendEmailVerificationUseCase: makeSendEmailVerificationUseCase({
          execute: vi.fn().mockRejectedValue(new RateLimitedError()),
        }),
        registerRateLimiter: makeRateLimiter(),
      });

      await expect(
        useCase.execute({
          email: 'a@example.com',
          password: 'password123',
          ipAddress: '203.0.113.7',
        }),
      ).resolves.toEqual({ userId: 'user-1', email: 'test@example.com' });
    });
  });
});
