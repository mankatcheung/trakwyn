import type { ICaptchaVerifier } from '#src/use-cases/ports/ICaptchaVerifier.js';
import type { ILogger } from '#src/use-cases/ports/ILogger.js';
import { CAPTCHA } from '#src/infrastructure/config/constants.js';

interface Deps {
  secretKey: string;
  logger: ILogger;
  fetchImpl?: typeof fetch;
}

interface SiteverifyResponse {
  success?: boolean;
}

/**
 * Verifies a Cloudflare Turnstile token with one POST to `siteverify`
 * (JEF-401). Fails closed: a provider outage or a malformed answer refuses
 * the request rather than waving it through, because the point of the check
 * is to stop a script that would simply wait out an outage.
 */
export class TurnstileCaptchaVerifier implements ICaptchaVerifier {
  private readonly secretKey: string;
  private readonly logger: ILogger;
  private readonly fetchImpl: typeof fetch;

  constructor({ secretKey, logger, fetchImpl = fetch }: Deps) {
    this.secretKey = secretKey;
    this.logger = logger;
    this.fetchImpl = fetchImpl;
  }

  async verify(token: string | null | undefined, ipAddress: string | null): Promise<boolean> {
    if (!token || token.length > CAPTCHA.MAX_TOKEN_LENGTH) return false;

    const body = new URLSearchParams({ secret: this.secretKey, response: token });
    if (ipAddress) body.set('remoteip', ipAddress);

    try {
      const res = await this.fetchImpl(CAPTCHA.TURNSTILE_VERIFY_URL, {
        method: 'POST',
        body,
        signal: AbortSignal.timeout(CAPTCHA.VERIFY_TIMEOUT_MS),
      });
      if (!res.ok) {
        this.logger.error(`[captcha] Turnstile siteverify answered ${res.status}`);
        return false;
      }
      const result = (await res.json()) as SiteverifyResponse;
      return result.success === true;
    } catch (err) {
      this.logger.error('[captcha] Turnstile siteverify failed — refusing the request', err);
      return false;
    }
  }
}
