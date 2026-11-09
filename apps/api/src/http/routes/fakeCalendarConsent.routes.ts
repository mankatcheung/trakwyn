import type { RouteDefinition } from '#src/http/ports/RouteDefinition.js';
import { CALENDAR_PROVIDER, ROUTES } from '#src/http/constants.js';
import { CALENDAR_OAUTH } from '#src/infrastructure/config/constants.js';

/**
 * The "provider" side of `FakeCalendarProvider` — see `fakeOAuthConsent.routes.ts`
 * for the full rationale, which this mirrors exactly for the calendar-connect
 * flow. Registered only when `CALENDAR_PROVIDER_MODE=fake`.
 */
export function fakeCalendarConsentRoutes(): RouteDefinition[] {
  return [
    {
      method: 'GET',
      path: ROUTES.CALENDAR_OAUTH_FAKE_CONSENT,
      handler: async (req, res) => {
        const provider = req.query.provider;
        const state = req.query.state;
        if (typeof provider !== 'string' || typeof state !== 'string') {
          res.status(400).send({ error: 'Missing provider or state' });
          return;
        }
        if (!Object.values(CALENDAR_PROVIDER).includes(provider as never)) {
          res.status(404).send({ error: 'Unknown calendar provider' });
          return;
        }

        const redirectUri = `${req.protocol}://${req.headers.host}${CALENDAR_OAUTH.callbackPath(provider)}`;

        if (req.query.deny === '1') {
          res.redirect(`${redirectUri}?error=access_denied&state=${encodeURIComponent(state)}`);
          return;
        }

        const tokenBundle = {
          accessToken: `fake-access-${provider}-${Date.now()}`,
          refreshToken: `fake-refresh-${provider}-${Date.now()}`,
        };
        const code = Buffer.from(JSON.stringify(tokenBundle), 'utf8').toString('base64url');
        res.redirect(
          `${redirectUri}?code=${encodeURIComponent(code)}&state=${encodeURIComponent(state)}`,
        );
      },
    },
  ];
}
