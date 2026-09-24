import { UnauthorizedError } from '#src/use-cases/errors/DomainError.js';
import type { ISessionRepository } from '#src/use-cases/ports/ISessionRepository.js';
import type { ILogger } from '#src/use-cases/ports/ILogger.js';
import type { Session } from '#src/domain/session/Session.js';
import { SESSION } from '#src/use-cases/constants.js';

interface Deps {
  sessionRepository: ISessionRepository;
  generateId: () => string;
  logger: ILogger;
}

export interface RotateRefreshTokenInput {
  sessionId: string;
  /** The `jti` presented on the refresh token, or null for a pre-rotation-tracking legacy token. */
  presentedTokenId: string | null;
}

export interface RotateRefreshTokenResult {
  session: Session;
  newTokenId: string;
}

function unauthorized(): never {
  throw new UnauthorizedError('Session revoked or expired');
}

export class RotateRefreshTokenUseCase {
  constructor(private readonly deps: Deps) {}

  async execute(input: RotateRefreshTokenInput): Promise<RotateRefreshTokenResult> {
    const session = await this.deps.sessionRepository.findById(input.sessionId);
    if (!session || session.revokedAt || session.expiresAt < new Date()) {
      unauthorized();
    }

    const expiresAt = new Date(Date.now() + SESSION.TTL_MS);

    // Exact match on the current token — normal rotation.
    if (
      session.currentRefreshTokenId !== null &&
      input.presentedTokenId === session.currentRefreshTokenId
    ) {
      const newTokenId = this.deps.generateId();
      const previousRotatedAt = new Date();
      await this.deps.sessionRepository.rotateRefreshToken(session.id, {
        currentRefreshTokenId: newTokenId,
        previousRefreshTokenId: session.currentRefreshTokenId,
        previousRotatedAt,
        expiresAt,
      });
      return {
        session: {
          ...session,
          currentRefreshTokenId: newTokenId,
          previousRefreshTokenId: session.currentRefreshTokenId,
          previousRotatedAt,
          expiresAt,
        },
        newTokenId,
      };
    }

    // Matches the just-superseded token within the grace window — a benign
    // concurrent-refresh race (e.g. two tabs). Re-issue tokens bound to the
    // still-current id rather than rotating again, so both tabs converge.
    if (
      session.currentRefreshTokenId !== null &&
      session.previousRefreshTokenId !== null &&
      session.previousRotatedAt !== null &&
      input.presentedTokenId === session.previousRefreshTokenId &&
      Date.now() - session.previousRotatedAt.getTime() < SESSION.ROTATION_GRACE_MS
    ) {
      await this.deps.sessionRepository.touch(session.id, expiresAt);
      return {
        session: { ...session, expiresAt },
        newTokenId: session.currentRefreshTokenId,
      };
    }

    // Session predates rotation tracking — adopt whatever is presented as
    // the new baseline instead of forcing every existing session to log out.
    if (session.currentRefreshTokenId === null) {
      const newTokenId = this.deps.generateId();
      const previousRefreshTokenId = input.presentedTokenId ?? this.deps.generateId();
      const previousRotatedAt = new Date();
      await this.deps.sessionRepository.rotateRefreshToken(session.id, {
        currentRefreshTokenId: newTokenId,
        previousRefreshTokenId,
        previousRotatedAt,
        expiresAt,
      });
      return {
        session: {
          ...session,
          currentRefreshTokenId: newTokenId,
          previousRefreshTokenId,
          previousRotatedAt,
          expiresAt,
        },
        newTokenId,
      };
    }

    // Anything else is a stale or unknown token id — the refresh token has
    // already been superseded and is being reused, the classic signal that
    // it was stolen. Kill the whole session rather than just rejecting.
    await this.deps.sessionRepository.revoke(session.id);
    // The ids go in the message, not in a context object: what the logger
    // accepts alongside a message is an error, and it is reduced to an
    // allow-list of error fields before it is written (JEF-348), so a bag of
    // extra properties would not have survived anyway.
    this.deps.logger.error(
      `Refresh token reuse detected for session ${session.id} (user ${session.userId})`,
    );
    unauthorized();
  }
}
