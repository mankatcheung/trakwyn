import { describe, it, expect, vi, beforeEach } from 'vitest';
import { RequestStepUpCodeUseCase } from '#src/use-cases/auth/RequestStepUpCodeUseCase.js';
import { VerifyStepUpCodeUseCase } from '#src/use-cases/auth/VerifyStepUpCodeUseCase.js';
import {
  makeUserActionToken,
  makeUserActionTokenRepository,
} from '#src/__tests__/helpers/mocks/auth.js';
import {
  makeEmailService,
  makeLogger,
  makeRateLimiter,
} from '#src/__tests__/helpers/mocks/infrastructure.js';
import { makeUser, makeUserRepository } from '#src/__tests__/helpers/mocks/user.js';
import { hashStepUpCode } from '#src/use-cases/shared/actionTokens.js';
import { STEP_UP_CODE } from '#src/use-cases/constants.js';

const NOW = new Date('2026-10-28T12:00:00.000Z');
const oauthOnlyUser = makeUser({ passwordHash: null });

describe('RequestStepUpCodeUseCase', () => {
  beforeEach(() => vi.clearAllMocks());

  const build = (
    overrides: Partial<ConstructorParameters<typeof RequestStepUpCodeUseCase>[0]> = {},
  ) => {
    const deps = {
      userRepository: makeUserRepository({ findById: vi.fn().mockResolvedValue(oauthOnlyUser) }),
      userActionTokenRepository: makeUserActionTokenRepository(),
      emailService: makeEmailService(),
      stepUpCodeRateLimiter: makeRateLimiter(),
      logger: makeLogger(),
      generateId: () => 'token-id',
      now: () => NOW,
      ...overrides,
    };
    return { deps, useCase: new RequestStepUpCodeUseCase(deps) };
  };

  it('stores only the hash of a 6-digit code and mails the code', async () => {
    const { deps, useCase } = build();

    await useCase.execute('user-1');

    const code = vi.mocked(deps.emailService.sendStepUpCode).mock.calls[0]?.[1];
    expect(code).toMatch(/^\d{6}$/);
    expect(deps.emailService.sendStepUpCode).toHaveBeenCalledWith('test@example.com', code);
    expect(deps.userActionTokenRepository.issue).toHaveBeenCalledWith({
      id: 'token-id',
      userId: 'user-1',
      purpose: 'step_up_code',
      tokenHash: hashStepUpCode('user-1', code!),
      expiresAt: new Date(NOW.getTime() + STEP_UP_CODE.TTL_MS),
    });
  });

  it('refuses an account with a password, so a code is never a way around it', async () => {
    const { deps, useCase } = build({
      userRepository: makeUserRepository({ findById: vi.fn().mockResolvedValue(makeUser()) }),
    });

    await expect(useCase.execute('user-1')).rejects.toMatchObject({ code: 'FORBIDDEN' });
    expect(deps.userActionTokenRepository.issue).not.toHaveBeenCalled();
    expect(deps.emailService.sendStepUpCode).not.toHaveBeenCalled();
  });

  it('refuses once the per-account budget is spent, before minting anything', async () => {
    const { deps, useCase } = build({
      stepUpCodeRateLimiter: makeRateLimiter({ consume: vi.fn().mockResolvedValue(false) }),
    });

    await expect(useCase.execute('user-1')).rejects.toMatchObject({ code: 'RATE_LIMITED' });
    expect(deps.stepUpCodeRateLimiter.consume).toHaveBeenCalledWith('step-up-code:user:user-1');
    expect(deps.userActionTokenRepository.issue).not.toHaveBeenCalled();
  });

  it('says so when the mail cannot be sent, and logs the cause', async () => {
    const { deps, useCase } = build({
      emailService: makeEmailService({
        sendStepUpCode: vi.fn().mockRejectedValue(new Error('Brevo API error 500')),
      }),
    });

    await expect(useCase.execute('user-1')).rejects.toMatchObject({ code: 'SERVICE_UNAVAILABLE' });
    expect(deps.logger.error).toHaveBeenCalled();
  });
});

describe('VerifyStepUpCodeUseCase', () => {
  beforeEach(() => vi.clearAllMocks());

  const liveToken = makeUserActionToken({
    id: 'code-1',
    purpose: 'step_up_code',
    tokenHash: hashStepUpCode('user-1', '123456'),
  });

  const build = (
    overrides: Partial<ConstructorParameters<typeof VerifyStepUpCodeUseCase>[0]> = {},
  ) => {
    const deps = {
      userRepository: makeUserRepository({ findById: vi.fn().mockResolvedValue(oauthOnlyUser) }),
      userActionTokenRepository: makeUserActionTokenRepository({
        findLiveForUser: vi.fn().mockResolvedValue(liveToken),
      }),
      totpRateLimiter: makeRateLimiter(),
      now: () => NOW,
      ...overrides,
    };
    return { deps, useCase: new VerifyStepUpCodeUseCase(deps) };
  };

  it('accepts the right code, spends it and returns the user', async () => {
    const { deps, useCase } = build();

    const user = await useCase.execute({ userId: 'user-1', code: ' 123456 ' });

    expect(user).toBe(oauthOnlyUser);
    expect(deps.userActionTokenRepository.findLiveForUser).toHaveBeenCalledWith(
      'user-1',
      'step_up_code',
      NOW,
    );
    expect(deps.userActionTokenRepository.consume).toHaveBeenCalledWith('code-1', NOW);
  });

  it('refuses a wrong code without spending the real one', async () => {
    const { deps, useCase } = build();

    await expect(useCase.execute({ userId: 'user-1', code: '654321' })).rejects.toMatchObject({
      code: 'UNAUTHORIZED',
    });
    expect(deps.userActionTokenRepository.consume).not.toHaveBeenCalled();
  });

  it("refuses another user's code even when the digits match", async () => {
    const { useCase } = build({
      userActionTokenRepository: makeUserActionTokenRepository({
        findLiveForUser: vi
          .fn()
          .mockResolvedValue(
            makeUserActionToken({ tokenHash: hashStepUpCode('user-2', '123456') }),
          ),
      }),
    });

    await expect(useCase.execute({ userId: 'user-1', code: '123456' })).rejects.toMatchObject({
      code: 'UNAUTHORIZED',
    });
  });

  it('refuses when there is no live code', async () => {
    const { useCase } = build({ userActionTokenRepository: makeUserActionTokenRepository() });

    await expect(useCase.execute({ userId: 'user-1', code: '123456' })).rejects.toMatchObject({
      code: 'UNAUTHORIZED',
    });
  });

  it('refuses when a simultaneous request spent the code first', async () => {
    const { useCase } = build({
      userActionTokenRepository: makeUserActionTokenRepository({
        findLiveForUser: vi.fn().mockResolvedValue(liveToken),
        consume: vi.fn().mockResolvedValue(false),
      }),
    });

    await expect(useCase.execute({ userId: 'user-1', code: '123456' })).rejects.toMatchObject({
      code: 'UNAUTHORIZED',
    });
  });

  it('counts guesses per account before reading the code', async () => {
    const { deps, useCase } = build({
      totpRateLimiter: makeRateLimiter({ consume: vi.fn().mockResolvedValue(false) }),
    });

    await expect(useCase.execute({ userId: 'user-1', code: '123456' })).rejects.toMatchObject({
      code: 'RATE_LIMITED',
    });
    expect(deps.totpRateLimiter.consume).toHaveBeenCalledWith('step-up-code:verify:user-1');
    expect(deps.userActionTokenRepository.findLiveForUser).not.toHaveBeenCalled();
  });

  it('refuses an account with a password', async () => {
    const { useCase } = build({
      userRepository: makeUserRepository({ findById: vi.fn().mockResolvedValue(makeUser()) }),
    });

    await expect(useCase.execute({ userId: 'user-1', code: '123456' })).rejects.toMatchObject({
      code: 'FORBIDDEN',
    });
  });
});
