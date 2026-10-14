/**
 * Checks a captcha token the client obtained from the captcha provider's
 * widget (JEF-401).
 */
export interface ICaptchaVerifier {
  /**
   * Resolves true if `token` is a valid, unused solution. A missing or blank
   * token is simply invalid. `ipAddress` is passed on to the provider as a
   * hint when known; it is never required.
   */
  verify(token: string | null | undefined, ipAddress: string | null): Promise<boolean>;
}
