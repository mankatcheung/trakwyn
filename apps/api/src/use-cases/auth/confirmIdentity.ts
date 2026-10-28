import bcrypt from 'bcryptjs';
import type { User } from '#src/domain/user/User.js';
import {
  ForbiddenError,
  StepUpRequiredError,
  UnauthorizedError,
} from '#src/use-cases/errors/DomainError.js';
import { isSessionFresh } from '#src/use-cases/auth/sessionFreshness.js';

export interface IdentityProof {
  /** Required from an account that has a password; ignored for one that has none. */
  currentPassword?: string | null;
  /** See `isSessionFresh`: null is an API token, undefined a pre-JEF-44 session. */
  authTime?: number | null;
}

/**
 * The check in front of a sensitive account change (email, backup email).
 *
 * - With a password: the password, plus a fresh session when TOTP is on, as
 *   before JEF-463.
 * - Without one (an account made through Google or GitHub): a fresh session,
 *   which it gets from an OAuth or mailed-code step-up (JEF-463). Before that
 *   such an account could not make these changes at all. An API token is
 *   refused outright: it is "fresh" by definition, so it would otherwise be a
 *   way in with no proof at all.
 */
export async function confirmIdentity(
  user: Pick<User, 'passwordHash' | 'totpEnabled'>,
  proof: IdentityProof,
): Promise<void> {
  if (user.passwordHash === null) {
    if (proof.authTime === null) {
      throw new ForbiddenError('Sign in to Trakwyn to make this change');
    }
    if (!isSessionFresh(proof.authTime)) {
      throw new StepUpRequiredError('Please verify your identity again to continue.');
    }
    return;
  }

  if (!proof.currentPassword || !(await bcrypt.compare(proof.currentPassword, user.passwordHash))) {
    throw new UnauthorizedError('Invalid password');
  }
  if (user.totpEnabled && !isSessionFresh(proof.authTime)) {
    throw new StepUpRequiredError('Please verify your identity again to continue.');
  }
}
