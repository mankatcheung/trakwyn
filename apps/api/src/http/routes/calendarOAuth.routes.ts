import type { IHttpRequest } from '#src/http/ports/IHttpRequest.js';
import type { RouteDefinition } from '#src/http/ports/RouteDefinition.js';
import type { Cradle } from '#src/http/container.js';
import {
  ENV,
  NODE_ENV,
  CALENDAR_OAUTH,
  CALENDAR_PROVIDER_MODE,
} from '#src/infrastructure/config/constants.js';
import { COOKIES, COOKIE_PATH, CALENDAR_PROVIDER, ROUTES } from '#src/http/constants.js';
import type { CalendarProvider } from '#src/domain/calendarConnection/CalendarConnection.js';
import { createPkcePair } from '#src/infrastructure/auth/pkce.js';

const KNOWN_PROVIDERS = new Set<string>(Object.values(CALENDAR_PROVIDER));

function isKnownProvider(provider: string): provider is CalendarProvider {
  return KNOWN_PROVIDERS.has(provider);
}

function callbackUrl(request: IHttpRequest, provider: string): string {
  return `${request.protocol}://${request.headers.host}${CALENDAR_OAUTH.callbackPath(provider)}`;
}

const STATE_COOKIE_OPTIONS = {
  httpOnly: true,
  secure: process.env[ENV.NODE_ENV] === NODE_ENV.PRODUCTION,
  sameSite: 'lax',
  path: COOKIE_PATH,
  maxAge: Math.floor(CALENDAR_OAUTH.STATE_TTL_MS / 1000),
} as const;

const COOKIE_SEPARATOR = '.';

function encodeRedirectCookie(nonce: string, codeVerifier: string): string {
  return [nonce, codeVerifier].join(COOKIE_SEPARATOR);
}

function decodeRedirectCookie(
  request: IHttpRequest,
): { nonce: string; codeVerifier: string } | null {
  const raw = request.cookies[COOKIES.CALENDAR_OAUTH_STATE];
  if (typeof raw !== 'string') return null;
  const [nonce, codeVerifier] = raw.split(COOKIE_SEPARATOR);
  if (!nonce || !codeVerifier) return null;
  return { nonce, codeVerifier };
}

/** Same reasoning as `oauth.routes.ts`'s `stateMatchesBrowser` — proves this browser started the flow being completed, not just that this server minted some state (JEF-198). */
function stateMatchesBrowser(nonce: string, cookieNonce: string): boolean {
  return cookieNonce.length > 0 && cookieNonce === nonce;
}

/**
 * Web-only, link-only (there is no calendar "login") sibling of
 * `oauth.routes.ts`. Deliberately does not carry that route's mobile-handoff
 * branch — mobile calendar sync is out of scope for v1 (JEF-331 decision) —
 * which is what keeps this file a fraction of that one's size rather than
 * fully duplicating it.
 */
export function calendarOAuthRoutes(getCradle: () => Cradle): RouteDefinition[] {
  return [
    {
      method: 'GET',
      path: ROUTES.CALENDAR_OAUTH_START,
      handler: async (req, res) => {
        const { provider } = req.params;
        if (!isKnownProvider(provider)) {
          res.status(404).send({ error: 'Unknown calendar provider' });
          return;
        }

        const { tokenService, calendarProviderRegistry, calendarOAuthStateService } = getCradle();
        const cookieToken = req.cookies[COOKIES.ACCESS_TOKEN];
        if (!cookieToken) {
          res.status(401).send({ error: 'Must be logged in to connect a calendar' });
          return;
        }
        let userId: string;
        try {
          userId = tokenService.verifyAccess(cookieToken).sub;
        } catch {
          res.status(401).send({ error: 'Session expired' });
          return;
        }

        const usingFakeProvider =
          process.env[ENV.CALENDAR_PROVIDER_MODE] === CALENDAR_PROVIDER_MODE.FAKE;
        if (!usingFakeProvider && !process.env[ENV.GOOGLE_CALENDAR_CLIENT_ID]) {
          res.status(503).send({ error: `${provider} Calendar is not configured` });
          return;
        }

        const { state, nonce } = calendarOAuthStateService.issue(provider, userId);
        const { verifier, challenge } = createPkcePair();
        const authorizationUrl = calendarProviderRegistry
          .get(provider)
          .getAuthorizationUrl(state, callbackUrl(req, provider), challenge);

        res.setCookie(
          COOKIES.CALENDAR_OAUTH_STATE,
          encodeRedirectCookie(nonce, verifier),
          STATE_COOKIE_OPTIONS,
        );
        res.redirect(authorizationUrl);
      },
    },
    {
      method: 'GET',
      path: ROUTES.CALENDAR_OAUTH_CALLBACK,
      handler: async (req, res) => {
        const { provider } = req.params;
        const { webAppOrigin, calendarOAuthStateService } = getCradle();
        if (!isKnownProvider(provider)) {
          res.status(404).send({ error: 'Unknown calendar provider' });
          return;
        }

        const redirectCookie = decodeRedirectCookie(req);
        res.clearCookie(COOKIES.CALENDAR_OAUTH_STATE, { path: COOKIE_PATH });

        const settingsError = (slug: string): string =>
          `${webAppOrigin}/settings/integrations?calendarError=${slug}`;

        const code = typeof req.query.code === 'string' ? req.query.code : undefined;
        const state = typeof req.query.state === 'string' ? req.query.state : undefined;
        const error = typeof req.query.error === 'string' ? req.query.error : undefined;

        if (error) {
          res.redirect(settingsError('provider_denied'));
          return;
        }
        if (!code || !state) {
          res.redirect(settingsError('missing_code'));
          return;
        }

        let parsedState;
        try {
          parsedState = calendarOAuthStateService.verify(state);
        } catch {
          res.redirect(settingsError('invalid_state'));
          return;
        }
        if (parsedState.provider !== provider) {
          res.redirect(settingsError('provider_mismatch'));
          return;
        }
        if (!redirectCookie || !stateMatchesBrowser(parsedState.nonce, redirectCookie.nonce)) {
          res.redirect(settingsError('invalid_state'));
          return;
        }

        try {
          const { connectCalendarUseCase } = getCradle();
          await connectCalendarUseCase.execute({
            userId: parsedState.userId,
            provider,
            code,
            redirectUri: callbackUrl(req, provider),
            codeVerifier: redirectCookie.codeVerifier,
          });
          res.redirect(`${webAppOrigin}/settings/integrations?calendarConnected=${provider}`);
        } catch (err) {
          getCradle().logger.error(`Calendar connect failed for ${provider}`, err);
          res.redirect(settingsError('connect_failed'));
        }
      },
    },
  ];
}
