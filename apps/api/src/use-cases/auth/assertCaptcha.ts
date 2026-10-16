import { CaptchaFailedError, CaptchaRequiredError } from '#src/use-cases/errors/DomainError.js';
import type { ICaptchaVerifier } from '#src/use-cases/ports/ICaptchaVerifier.js';

/**
 * Throws unless the verifier accepts `token` (JEF-401).
 *
 * A request with no token at all is `CaptchaRequiredError`, so a client that
 * does not show the widget until it has to (login after repeated failures)
 * learns it must. A token the verifier refuses is `CaptchaFailedError`: the
 * widget was solved, and the answer was no good.
 */
export async function assertCaptcha(
  verifier: ICaptchaVerifier,
  token: string | null | undefined,
  ipAddress: string | null | undefined,
): Promise<void> {
  if (await verifier.verify(token, ipAddress ?? null)) return;
  throw token ? new CaptchaFailedError() : new CaptchaRequiredError();
}
