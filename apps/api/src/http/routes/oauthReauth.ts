import type { Cradle } from '#src/http/container.js';
import type { IHttpResponse } from '#src/http/ports/IHttpResponse.js';
import { setAuthCookies } from '#src/http/schema/types/AuthPayloadType.js';
import type { OAuthProviderName } from '#src/domain/oauthAccount/OAuthAccount.js';
import type { OAuthState } from '#src/infrastructure/auth/OAuthStateService.js';
import { OAUTH_ERROR, reauthErrorSlug } from '#src/http/routes/oauthErrorSlug.js';
import type { OAuthPlatform } from '#src/http/routes/oauthPlatform.js';
import { OAUTH_PLATFORM } from '#src/http/constants.js';

/** Where a web step-up lands when the client named no page to return to. */
const DEFAULT_WEB_RETURN = '/settings/security';

/** The query param a web page reads to learn how its step-up ended. */
export const STEP_UP_RESULT_PARAM = { OK: 'stepUp', ERROR: 'stepUpError' } as const;

/**
 * The start route's `reauth` checks: who and which session, from the ticket
 * `startOAuthReauth` minted, and a client that can receive the result. The
 * extensions are left out: they have no step-up to finish. Returns the
 * refusal as a status and message, so the route stays the one place that
 * answers.
 */
export function readReauthTicket(
  cradle: Cradle,
  ticket: unknown,
  platform: OAuthPlatform,
): { userId: string; sessionId: string } | { status: number; error: string } {
  if (platform !== OAUTH_PLATFORM.WEB && platform !== OAUTH_PLATFORM.MOBILE) {
    return { status: 400, error: 'Step-up is not available on this client' };
  }
  if (typeof ticket !== 'string') {
    return { status: 401, error: 'Missing step-up ticket' };
  }
  try {
    const { userId, sessionId } = cradle.oauthStateService.verifyReauthTicket(ticket);
    return { userId, sessionId };
  } catch {
    return { status: 401, error: 'Invalid or expired step-up ticket' };
  }
}

export interface CompleteOAuthReauthInput {
  provider: OAuthProviderName;
  code: string;
  redirectUri: string;
  codeVerifier: string;
  state: OAuthState;
  /** Set for the mobile app: the tokens cross to it as a handoff code, not cookies. */
  handoff?: { base: string; codeChallenge: string };
}

/**
 * The callback's `reauth` branch (JEF-463): the provider has signed the user
 * in again, so check it is the linked account and recent, then re-sign the
 * session that started the flow with a fresh `authTime`. That session is the
 * one the ticket named, not whatever cookie this browser holds.
 *
 * The web page that started it gets `?stepUp=ok` or `?stepUpError=<slug>` and
 * retries its own action; the mobile app gets the tokens through the same
 * handoff code as a sign-in.
 */
export async function completeOAuthReauth(
  cradle: Cradle,
  res: IHttpResponse,
  input: CompleteOAuthReauthInput,
): Promise<void> {
  const { webAppOrigin, logger } = cradle;
  const fail = (slug: string): void => {
    if (input.handoff) {
      res.redirect(`${input.handoff.base}?oauthError=${slug}`);
    } else {
      res.redirect(
        webReturnUrl(webAppOrigin, input.state.returnTo, STEP_UP_RESULT_PARAM.ERROR, slug),
      );
    }
  };

  const { userId, sessionId } = input.state;
  if (!userId || !sessionId) {
    fail(OAUTH_ERROR.MISSING_USER);
    return;
  }

  try {
    const user = await cradle.reauthenticateWithOAuthUseCase.execute({
      userId,
      provider: input.provider,
      code: input.code,
      redirectUri: input.redirectUri,
      codeVerifier: input.codeVerifier,
    });
    const tokens = await cradle.authResolver.completeStepUp(user, sessionId);
    if (input.handoff) {
      const handoffCode = cradle.mobileOAuthHandoffService.issue(
        tokens.accessToken,
        tokens.refreshToken,
        input.handoff.codeChallenge,
      );
      res.redirect(`${input.handoff.base}?code=${encodeURIComponent(handoffCode)}`);
      return;
    }
    setAuthCookies(res, tokens.accessToken, tokens.refreshToken);
    res.redirect(webReturnUrl(webAppOrigin, input.state.returnTo, STEP_UP_RESULT_PARAM.OK, '1'));
  } catch (err) {
    logger.error(`OAuth step-up failed for ${input.provider}`, err);
    fail(reauthErrorSlug(err));
  }
}

function webReturnUrl(
  webAppOrigin: string,
  returnTo: string | undefined,
  param: string,
  value: string,
): string {
  const url = new URL(returnTo ?? DEFAULT_WEB_RETURN, webAppOrigin);
  url.searchParams.set(param, value);
  return url.toString();
}
