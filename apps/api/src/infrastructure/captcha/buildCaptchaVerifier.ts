import type { ICaptchaVerifier } from '#src/use-cases/ports/ICaptchaVerifier.js';
import type { ILogger } from '#src/use-cases/ports/ILogger.js';
import { CAPTCHA, ENV, NODE_ENV } from '#src/infrastructure/config/constants.js';
import { PermissiveCaptchaVerifier } from '#src/infrastructure/captcha/PermissiveCaptchaVerifier.js';
import { TurnstileCaptchaVerifier } from '#src/infrastructure/captcha/TurnstileCaptchaVerifier.js';

/**
 * `CAPTCHA_PROVIDER` when set, else Turnstile in production and permissive
 * everywhere else — the same shape as `OUTBOUND_URL_POLICY`. Turnstile without
 * its secret throws, so a production deploy that forgot the secret says so
 * instead of silently accepting every token.
 */
export function buildCaptchaVerifier(logger: ILogger): ICaptchaVerifier {
  const configured = process.env[ENV.CAPTCHA_PROVIDER]?.trim();
  const provider =
    configured ||
    (process.env[ENV.NODE_ENV] === NODE_ENV.PRODUCTION
      ? CAPTCHA.PROVIDER.TURNSTILE
      : CAPTCHA.PROVIDER.DISABLED);

  if (provider === CAPTCHA.PROVIDER.DISABLED) return new PermissiveCaptchaVerifier();
  if (provider !== CAPTCHA.PROVIDER.TURNSTILE) {
    throw new Error(`${ENV.CAPTCHA_PROVIDER} must be "turnstile" or "disabled", got "${provider}"`);
  }

  const secretKey = process.env[ENV.TURNSTILE_SECRET_KEY]?.trim();
  if (!secretKey) {
    throw new Error(
      `${ENV.TURNSTILE_SECRET_KEY} is required when ${ENV.CAPTCHA_PROVIDER} is turnstile`,
    );
  }
  return new TurnstileCaptchaVerifier({ secretKey, logger });
}
