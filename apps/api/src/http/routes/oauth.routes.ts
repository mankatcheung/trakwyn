import type { IHttpRequest } from '#src/http/ports/IHttpRequest.js';
import type { RouteDefinition } from '#src/http/ports/RouteDefinition.js';
import type { Cradle } from '#src/http/container.js';
import { setAuthCookies } from '#src/http/schema/types/AuthPayloadType.js';
import { ENV, EXTENSION_OAUTH, NODE_ENV, OAUTH } from '#src/infrastructure/config/constants.js';
import {
  COOKIES,
  COOKIE_PATH,
  MOBILE_OAUTH_CALLBACK,
  OAUTH_PLATFORM,
  OAUTH_PROVIDER,
  ROUTES,
} from '#src/http/constants.js';
import type { OAuthProviderName } from '#src/domain/oauthAccount/OAuthAccount.js';
import { createPkcePair, isWellFormedPkceValue } from '#src/infrastructure/auth/pkce.js';
import {
  OAUTH_ERROR,
  type OAuthErrorSlug,
  linkErrorSlug,
  loginErrorSlug,
  providerErrorSlug,
} from '#src/http/routes/oauthErrorSlug.js';

type OAuthPlatform = (typeof OAUTH_PLATFORM)[keyof typeof OAUTH_PLATFORM];

function parsePlatform(value: unknown): OAuthPlatform {
  if (value === OAUTH_PLATFORM.MOBILE) return OAUTH_PLATFORM.MOBILE;
  if (value === OAUTH_PLATFORM.EXTENSION) return OAUTH_PLATFORM.EXTENSION;
  return OAUTH_PLATFORM.WEB;
}

/**
 * Where a non-web login is handed its tokens: the app's deep link for mobile,
 * or the extension's `chromiumapp.org` URL (JEF-383). `undefined` means web,
 * which gets cookies instead.
 *
 * The extension ID is checked against the allowlist again here, not only at
 * /start, so the redirect host never rests on the cookie alone.
 */
function handoffRedirectBase(
  platform: OAuthPlatform,
  extensionId: string,
  allowedExtensionIds: ReadonlySet<string>,
): string | undefined {
  if (platform === OAUTH_PLATFORM.MOBILE) return MOBILE_OAUTH_CALLBACK;
  if (platform === OAUTH_PLATFORM.EXTENSION && allowedExtensionIds.has(extensionId)) {
    return EXTENSION_OAUTH.redirectUrl(extensionId);
  }
  return undefined;
}

const KNOWN_PROVIDERS = new Set<string>(Object.values(OAUTH_PROVIDER));

function isKnownProvider(provider: string): provider is OAuthProviderName {
  return KNOWN_PROVIDERS.has(provider);
}

function callbackUrl(request: IHttpRequest, provider: string): string {
  return `${request.protocol}://${request.headers.host}${OAUTH.callbackPath(provider)}`;
}

/**
 * Options for the cookie that ties a redirect to the browser that began it.
 *
 * `SameSite=Lax`, deliberately not the `none` the auth cookies use: the
 * callback arrives as a top-level GET navigation, which Lax permits, and
 * anything looser would weaken the very thing this cookie exists to prove.
 * Host-only (no `domain`) because only this API ever reads it, and scoped to
 * the same window as the state it guards.
 */
const STATE_COOKIE_OPTIONS = {
  httpOnly: true,
  secure: process.env[ENV.NODE_ENV] === NODE_ENV.PRODUCTION,
  sameSite: 'lax',
  path: COOKIE_PATH,
  maxAge: Math.floor(OAUTH.STATE_TTL_MS / 1000),
} as const;

/**
 * The redirect cookie carries five things the callback needs and the
 * browser must not be able to tamper with: the state's nonce (JEF-198), the
 * provider-facing PKCE verifier (JEF-200), which client started the flow
 * (JEF-275, read even by branches that never verify `state`), the client's
 * own PKCE code_challenge for the handoff code (mobile, JEF-275, and
 * extension, JEF-383), and, extension only, which extension to hand back to.
 * The last two are empty for web, which has no handoff code to bind.
 *
 * One cookie rather than several: created, read and cleared together, so it
 * cannot arrive with some parts but not others. Every part is base64url,
 * hex, empty, a fixed OAUTH_PLATFORM value or an `[a-p]` extension ID, so
 * none can contain the separator.
 */
const COOKIE_SEPARATOR = '.';

function encodeRedirectCookie(
  nonce: string,
  codeVerifier: string,
  platform: OAuthPlatform,
  handoffCodeChallenge: string,
  extensionId: string,
): string {
  return [nonce, codeVerifier, platform, handoffCodeChallenge, extensionId].join(COOKIE_SEPARATOR);
}

function decodeRedirectCookie(request: IHttpRequest): {
  nonce: string;
  codeVerifier: string;
  platform: OAuthPlatform;
  handoffCodeChallenge: string;
  extensionId: string;
} | null {
  const raw = request.cookies[COOKIES.OAUTH_STATE];
  if (typeof raw !== 'string') return null;
  const [nonce, codeVerifier, platform, handoffCodeChallenge, extensionId] =
    raw.split(COOKIE_SEPARATOR);
  if (!nonce || !codeVerifier) return null;
  return {
    nonce,
    codeVerifier,
    platform: parsePlatform(platform),
    handoffCodeChallenge: handoffCodeChallenge ?? '',
    extensionId: extensionId ?? '',
  };
}

/**
 * The signature proves we minted a state; it does not prove we minted it for
 * the browser presenting it. Without this check an attacker can run the flow
 * themselves, keep their own valid code and state, and hand the victim the
 * callback URL — logging the victim into the attacker's account (JEF-198).
 *
 * A missing or half-formed cookie is a hard failure, never a fall-through:
 * treating it as "no cookie, carry on" would leave the hole open while looking
 * closed, and would silently drop PKCE with it.
 */
function stateMatchesBrowser(nonce: string, cookieNonce: string): boolean {
  return cookieNonce.length > 0 && cookieNonce === nonce;
}

export function oauthRoutes(getCradle: () => Cradle): RouteDefinition[] {
  return [
    {
      method: 'GET',
      path: ROUTES.OAUTH_START,
      handler: async (req, res) => {
        const { provider } = req.params;
        if (!isKnownProvider(provider)) {
          res.status(404).send({ error: 'Unknown OAuth provider' });
          return;
        }

        const mode = req.query.mode === 'link' ? 'link' : 'login';
        // Only meaningful for mode 'login' — linking only ever starts from the
        // web settings page — but read unconditionally so it's always in the
        // cookie the callback reads back.
        const platform = parsePlatform(req.query.platform);

        // The client's own PKCE, over the handoff code — distinct from the
        // provider-facing pair below. Required, not optional (JEF-275): a
        // client that omitted it would get a handoff code nothing binds to it.
        let handoffCodeChallenge = '';
        if (platform !== OAUTH_PLATFORM.WEB) {
          if (!isWellFormedPkceValue(req.query.codeChallenge)) {
            res.status(400).send({ error: 'Missing or malformed codeChallenge' });
            return;
          }
          handoffCodeChallenge = req.query.codeChallenge;
        }

        // Only an allowlisted extension may be redirected to (JEF-383): the
        // ID names the host the handoff code is sent to.
        let extensionId = '';
        if (platform === OAUTH_PLATFORM.EXTENSION) {
          const requested = req.query.extensionId;
          if (typeof requested !== 'string' || !getCradle().extensionOAuthIds.has(requested)) {
            res.status(400).send({ error: 'Unknown extensionId' });
            return;
          }
          extensionId = requested;
        }

        let userId: string | undefined;
        const { tokenService } = getCradle();
        if (mode === 'link') {
          const cookieToken = req.cookies[COOKIES.ACCESS_TOKEN];
          if (!cookieToken) {
            res.status(401).send({ error: 'Must be logged in to link a provider' });
            return;
          }
          try {
            userId = tokenService.verifyAccess(cookieToken).sub;
          } catch {
            res.status(401).send({ error: 'Session expired' });
            return;
          }
        }

        const { oauthProviderRegistry, oauthStateService } = getCradle();
        if (
          !process.env[
            provider === OAUTH_PROVIDER.GOOGLE
              ? ENV.GOOGLE_OAUTH_CLIENT_ID
              : ENV.GITHUB_OAUTH_CLIENT_ID
          ]
        ) {
          res.status(503).send({ error: `${provider} OAuth is not configured` });
          return;
        }

        const returnTo = mode === 'login' ? safeReturnTo(req.query.returnTo) : undefined;
        const { state, nonce } = oauthStateService.issue(provider, mode, userId, returnTo);
        // Only the challenge — the hash — goes to the provider. The verifier
        // stays here, in the cookie, so capturing the redirect URL reveals
        // nothing that could redeem the code.
        const { verifier, challenge } = createPkcePair();
        const authorizationUrl = oauthProviderRegistry
          .get(provider)
          .getAuthorizationUrl(state, callbackUrl(req, provider), challenge);

        // Set on the same response as the redirect, so the browser carries it
        // through the provider and back — see the cookie note above.
        res.setCookie(
          COOKIES.OAUTH_STATE,
          encodeRedirectCookie(nonce, verifier, platform, handoffCodeChallenge, extensionId),
          STATE_COOKIE_OPTIONS,
        );
        res.redirect(authorizationUrl);
      },
    },
    {
      method: 'GET',
      path: ROUTES.OAUTH_CALLBACK,
      handler: async (req, res) => {
        const { provider } = req.params;
        const { webAppOrigin, oauthStateService, extensionOAuthIds } = getCradle();
        if (!isKnownProvider(provider)) {
          res.status(404).send({ error: 'Unknown OAuth provider' });
          return;
        }

        // Read before clearing (clearCookie only affects the response, not the
        // `req` object) — every early-exit branch below needs it to know
        // where to send the user, including ones that never reach a verified
        // `state`, which is exactly why platform lives here and not in it.
        const redirectCookie = decodeRedirectCookie(req);
        const handoffBase = redirectCookie
          ? handoffRedirectBase(
              redirectCookie.platform,
              redirectCookie.extensionId,
              extensionOAuthIds,
            )
          : undefined;
        const loginError = (slug: OAuthErrorSlug): string =>
          handoffBase
            ? `${handoffBase}?oauthError=${slug}`
            : `${webAppOrigin}/login?oauthError=${slug}`;

        // Cleared once here rather than on each branch below: this handler has
        // seven ways out, and a stale nonce left behind would block the user's
        // next attempt. The value is read from the request, so clearing the
        // response cookie now does not affect the checks above or below.
        res.clearCookie(COOKIES.OAUTH_STATE, { path: COOKIE_PATH });

        const code = typeof req.query.code === 'string' ? req.query.code : undefined;
        const state = typeof req.query.state === 'string' ? req.query.state : undefined;
        const error = typeof req.query.error === 'string' ? req.query.error : undefined;

        if (error) {
          res.redirect(loginError(providerErrorSlug(error)));
          return;
        }
        if (!code || !state) {
          res.redirect(loginError(OAUTH_ERROR.MISSING_CODE));
          return;
        }

        let parsedState;
        try {
          parsedState = oauthStateService.verify(state);
        } catch {
          res.redirect(loginError(OAUTH_ERROR.INVALID_STATE));
          return;
        }
        if (parsedState.provider !== provider) {
          res.redirect(loginError(OAUTH_ERROR.PROVIDER_MISMATCH));
          return;
        }
        if (!redirectCookie || !stateMatchesBrowser(parsedState.nonce, redirectCookie.nonce)) {
          res.redirect(loginError(OAUTH_ERROR.INVALID_STATE));
          return;
        }

        const redirectUri = callbackUrl(req, provider);

        if (parsedState.mode === 'link') {
          // The linked-accounts UI lives at /settings/security, not
          // /account (which just redirects to /settings/profile, dropping
          // this query string) — land there directly so the feedback
          // params below actually get seen.
          if (!parsedState.userId) {
            res.redirect(
              `${webAppOrigin}/settings/security?oauthError=${OAUTH_ERROR.MISSING_USER}`,
            );
            return;
          }
          try {
            const { linkOAuthAccountUseCase } = getCradle();
            await linkOAuthAccountUseCase.execute({
              userId: parsedState.userId,
              provider,
              code,
              redirectUri,
              codeVerifier: redirectCookie.codeVerifier,
            });
            res.redirect(`${webAppOrigin}/settings/security?oauthLinked=${provider}`);
          } catch (err) {
            // Logged, not shown: keeping raw error detail out of the
            // redirect URL (see OAUTH_ERROR above) must not mean losing it
            // entirely — an unexpected failure here has nowhere else to
            // surface.
            getCradle().logger.error(`OAuth link failed for ${provider}`, err);
            res.redirect(`${webAppOrigin}/settings/security?oauthError=${linkErrorSlug(err)}`);
          }
          return;
        }

        try {
          const {
            loginOrSignupWithOAuthUseCase,
            createSessionUseCase,
            tokenService,
            mobileOAuthHandoffService,
          } = getCradle();
          const { user } = await loginOrSignupWithOAuthUseCase.execute({
            provider,
            code,
            redirectUri,
            codeVerifier: redirectCookie.codeVerifier,
          });
          const userAgent =
            typeof req.headers['user-agent'] === 'string' ? req.headers['user-agent'] : null;
          const session = await createSessionUseCase.execute({
            userId: user.id,
            userAgent,
            ipAddress: req.ip,
          });
          const tokens = tokenService.sign(
            user.id,
            user.email,
            session.id,
            session.currentRefreshTokenId!,
            Date.now(),
          );
          if (handoffBase) {
            // No cookies — neither React Native nor the extension has a
            // cookie jar tied to the API, same reasoning as
            // mobileAuthMutations.ts. The tokens cross the redirect as an
            // opaque, short-lived handoff code instead;
            // exchangeMobileOAuthCode redeems it for both clients. The
            // challenge came from the cookie — /start already required it.
            const handoffCode = mobileOAuthHandoffService.issue(
              tokens.accessToken,
              tokens.refreshToken,
              redirectCookie.handoffCodeChallenge,
            );
            res.redirect(`${handoffBase}?code=${encodeURIComponent(handoffCode)}`);
          } else {
            setAuthCookies(res, tokens.accessToken, tokens.refreshToken);
            res.redirect(returnToUrl(webAppOrigin, parsedState.returnTo));
          }
        } catch (err) {
          getCradle().logger.error(`OAuth login failed for ${provider}`, err);
          res.redirect(loginError(loginErrorSlug(err)));
        }
      },
    },
  ];
}

function safeReturnTo(value: string | string[] | undefined): string | undefined {
  if (typeof value !== 'string' || !value.startsWith('/') || value.startsWith('//'))
    return undefined;
  return value;
}

function returnToUrl(webAppOrigin: string, returnTo: string | undefined): string {
  // A plain sign-in with no captured destination lands on the dashboard,
  // not `/` — the landing page doesn't redirect logged-in visitors
  // elsewhere, so `/` would leave a freshly-signed-in user looking at the
  // marketing page instead of their dashboard.
  return returnTo ? `${webAppOrigin}${returnTo}` : `${webAppOrigin}/dashboard`;
}
