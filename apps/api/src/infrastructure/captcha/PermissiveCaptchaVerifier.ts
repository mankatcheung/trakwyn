import type { ICaptchaVerifier } from '#src/use-cases/ports/ICaptchaVerifier.js';

/**
 * Accepts any token, including none. For local dev, CI and e2e, where there
 * is no widget to solve (JEF-401). Never selected in production unless
 * `CAPTCHA_PROVIDER=disabled` says so on purpose.
 */
export class PermissiveCaptchaVerifier implements ICaptchaVerifier {
  async verify(): Promise<boolean> {
    return true;
  }
}
