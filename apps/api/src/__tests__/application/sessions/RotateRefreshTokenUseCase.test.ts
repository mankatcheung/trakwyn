import { describe, it, expect, vi, beforeEach } from 'vitest';
import { RotateRefreshTokenUseCase } from '#src/use-cases/sessions/RotateRefreshTokenUseCase.js';
import { makeLogger } from '#src/__tests__/helpers/mocks/infrastructure.js';
import { makeSession, makeSessionRepository } from '#src/__tests__/helpers/mocks/sessions.js';
import { ERROR_CODES } from '#src/use-cases/errors/errorCodes.js';
import { SESSION } from '#src/use-cases/constants.js';

const futureExpiry = () => new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

describe('RotateRefreshTokenUseCase', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('throws UNAUTHORIZED when the session does not exist', async () => {
    const sessionRepository = makeSessionRepository({ findById: vi.fn().mockResolvedValue(null) });
    const generateId = vi.fn();
    const logger = makeLogger();

    const err = await new RotateRefreshTokenUseCase({ sessionRepository, generateId, logger })
      .execute({ sessionId: 'missing', presentedTokenId: 'anything' })
      .catch((e) => e);

    expect((err as { code: string }).code).toBe(ERROR_CODES.UNAUTHORIZED);
  });

  it('throws UNAUTHORIZED when the session has been revoked', async () => {
    const session = makeSession({ expiresAt: futureExpiry(), revokedAt: new Date() });
    const sessionRepository = makeSessionRepository({
      findById: vi.fn().mockResolvedValue(session),
    });
    const generateId = vi.fn();
    const logger = makeLogger();

    const err = await new RotateRefreshTokenUseCase({ sessionRepository, generateId, logger })
      .execute({ sessionId: session.id, presentedTokenId: session.currentRefreshTokenId })
      .catch((e) => e);

    expect((err as { code: string }).code).toBe(ERROR_CODES.UNAUTHORIZED);
  });

  it('throws UNAUTHORIZED when the session has expired', async () => {
    const session = makeSession({ expiresAt: new Date(Date.now() - 1000) });
    const sessionRepository = makeSessionRepository({
      findById: vi.fn().mockResolvedValue(session),
    });
    const generateId = vi.fn();
    const logger = makeLogger();

    const err = await new RotateRefreshTokenUseCase({ sessionRepository, generateId, logger })
      .execute({ sessionId: session.id, presentedTokenId: session.currentRefreshTokenId })
      .catch((e) => e);

    expect((err as { code: string }).code).toBe(ERROR_CODES.UNAUTHORIZED);
  });

  it('rotates the token on an exact match with the current refresh token id', async () => {
    const session = makeSession({
      expiresAt: futureExpiry(),
      currentRefreshTokenId: 'current-id',
      previousRefreshTokenId: null,
    });
    const sessionRepository = makeSessionRepository({
      findById: vi.fn().mockResolvedValue(session),
    });
    const generateId = vi.fn().mockReturnValue('brand-new-id');
    const logger = makeLogger();

    const result = await new RotateRefreshTokenUseCase({
      sessionRepository,
      generateId,
      logger,
    }).execute({ sessionId: session.id, presentedTokenId: 'current-id' });

    expect(result.newTokenId).toBe('brand-new-id');
    expect(sessionRepository.rotateRefreshToken).toHaveBeenCalledWith(
      session.id,
      expect.objectContaining({
        currentRefreshTokenId: 'brand-new-id',
        previousRefreshTokenId: 'current-id',
      }),
    );
    expect(sessionRepository.revoke).not.toHaveBeenCalled();
    expect(logger.error).not.toHaveBeenCalled();
  });

  it('re-issues tokens bound to the current id without rotating again for a concurrent-refresh race within the grace window', async () => {
    const session = makeSession({
      expiresAt: futureExpiry(),
      currentRefreshTokenId: 'current-id',
      previousRefreshTokenId: 'previous-id',
      previousRotatedAt: new Date(Date.now() - 1000),
    });
    const sessionRepository = makeSessionRepository({
      findById: vi.fn().mockResolvedValue(session),
    });
    const generateId = vi.fn();
    const logger = makeLogger();

    const result = await new RotateRefreshTokenUseCase({
      sessionRepository,
      generateId,
      logger,
    }).execute({ sessionId: session.id, presentedTokenId: 'previous-id' });

    expect(result.newTokenId).toBe('current-id');
    expect(sessionRepository.touch).toHaveBeenCalledWith(session.id, expect.any(Date));
    expect(sessionRepository.rotateRefreshToken).not.toHaveBeenCalled();
    expect(sessionRepository.revoke).not.toHaveBeenCalled();
    expect(generateId).not.toHaveBeenCalled();
  });

  it('treats a stale previous token outside the grace window as reuse', async () => {
    const session = makeSession({
      expiresAt: futureExpiry(),
      currentRefreshTokenId: 'current-id',
      previousRefreshTokenId: 'previous-id',
      previousRotatedAt: new Date(Date.now() - (SESSION.ROTATION_GRACE_MS + 5000)),
    });
    const sessionRepository = makeSessionRepository({
      findById: vi.fn().mockResolvedValue(session),
    });
    const generateId = vi.fn();
    const logger = makeLogger();

    const err = await new RotateRefreshTokenUseCase({ sessionRepository, generateId, logger })
      .execute({ sessionId: session.id, presentedTokenId: 'previous-id' })
      .catch((e) => e);

    expect((err as { code: string }).code).toBe(ERROR_CODES.UNAUTHORIZED);
    expect(sessionRepository.revoke).toHaveBeenCalledWith(session.id);
    expect(logger.error).toHaveBeenCalled();
  });

  it('adopts the presented token as the baseline for a legacy session with no current token id', async () => {
    const session = makeSession({
      expiresAt: futureExpiry(),
      currentRefreshTokenId: null,
      previousRefreshTokenId: null,
    });
    const sessionRepository = makeSessionRepository({
      findById: vi.fn().mockResolvedValue(session),
    });
    const generateId = vi.fn().mockReturnValue('brand-new-id');
    const logger = makeLogger();

    const result = await new RotateRefreshTokenUseCase({
      sessionRepository,
      generateId,
      logger,
    }).execute({ sessionId: session.id, presentedTokenId: 'legacy-jti' });

    expect(result.newTokenId).toBe('brand-new-id');
    expect(sessionRepository.rotateRefreshToken).toHaveBeenCalledWith(
      session.id,
      expect.objectContaining({
        currentRefreshTokenId: 'brand-new-id',
        previousRefreshTokenId: 'legacy-jti',
      }),
    );
    expect(sessionRepository.revoke).not.toHaveBeenCalled();
  });

  it('adopts a generated placeholder for a legacy session with no current token id and no presented jti', async () => {
    const session = makeSession({
      expiresAt: futureExpiry(),
      currentRefreshTokenId: null,
      previousRefreshTokenId: null,
    });
    const sessionRepository = makeSessionRepository({
      findById: vi.fn().mockResolvedValue(session),
    });
    const generateId = vi
      .fn()
      .mockReturnValueOnce('brand-new-id')
      .mockReturnValueOnce('placeholder-id');
    const logger = makeLogger();

    const result = await new RotateRefreshTokenUseCase({
      sessionRepository,
      generateId,
      logger,
    }).execute({ sessionId: session.id, presentedTokenId: null });

    expect(result.newTokenId).toBe('brand-new-id');
    expect(sessionRepository.rotateRefreshToken).toHaveBeenCalledWith(
      session.id,
      expect.objectContaining({
        currentRefreshTokenId: 'brand-new-id',
        previousRefreshTokenId: 'placeholder-id',
      }),
    );
  });

  it('revokes the session and throws UNAUTHORIZED when a stale/unknown token id is presented', async () => {
    const session = makeSession({
      expiresAt: futureExpiry(),
      currentRefreshTokenId: 'current-id',
      previousRefreshTokenId: 'previous-id',
      previousRotatedAt: new Date(),
    });
    const sessionRepository = makeSessionRepository({
      findById: vi.fn().mockResolvedValue(session),
    });
    const generateId = vi.fn();
    const logger = makeLogger();

    const err = await new RotateRefreshTokenUseCase({ sessionRepository, generateId, logger })
      .execute({ sessionId: session.id, presentedTokenId: 'stolen-and-already-superseded-id' })
      .catch((e) => e);

    expect((err as { code: string }).code).toBe(ERROR_CODES.UNAUTHORIZED);
    expect(sessionRepository.revoke).toHaveBeenCalledWith(session.id);
    expect(logger.error).toHaveBeenCalledWith(
      `Refresh token reuse detected for session ${session.id} (user ${session.userId})`,
    );
  });
});
