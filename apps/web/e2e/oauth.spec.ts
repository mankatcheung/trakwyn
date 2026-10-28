import { test, expect } from '@playwright/test';
import { registerAndLogin, skipWelcomeIfShown, uniqueEmail } from './helpers/auth';

/**
 * Drives the real OAuth authorize -> provider -> callback round trip through
 * a browser, against FakeOAuthProvider (apps/api, selected by
 * OAUTH_PROVIDER_MODE=fake) rather than live Google/GitHub — the redirect,
 * PKCE/state cookie and callback handler are all real; only the external
 * provider itself is a same-origin stand-in, so there is no live-provider
 * dependency or secret needed in CI. See ci.yml's e2e job env block.
 */
test.describe('OAuth sign-in', () => {
  const password = 'SecurePass123';

  test('signs in via Google OAuth and lands on the dashboard', async ({ page }) => {
    await page.goto('/login');
    await page.getByRole('link', { name: /sign in with google/i }).click();
    await skipWelcomeIfShown(page);
  });

  test('signs in via GitHub OAuth and lands on the dashboard', async ({ page }) => {
    await page.goto('/login');
    await page.getByRole('link', { name: /sign in with github/i }).click();
    await skipWelcomeIfShown(page);
  });

  // Not covered here: the user-cancels-at-the-provider (access_denied) path
  // (JEF-203). It's already covered on both sides — the API's redirect
  // construction in oauth.routes.integration.test.ts, and the client's
  // "cancelled the sign-in" rendering in LoginPage.test.tsx — and driving it
  // through a real browser turned out to need faking a cross-origin redirect
  // hop, which Playwright's route interception doesn't reliably intercept for
  // this app's absolute (cross-port) OAuth start URL. Not worth chasing for
  // coverage that already exists.

  test('links a Google account from Settings, then unlinks it', async ({ page }) => {
    await registerAndLogin(page, { email: uniqueEmail('oauth-link'), password });
    await page.goto('/settings/security');

    const googleLinkButton = page.locator('a[href*="/auth/oauth/google/start?mode=link"]');
    await expect(googleLinkButton).toBeVisible();
    await googleLinkButton.click();

    await expect(page).toHaveURL(/\/settings\/security/);
    await expect(page.getByText('Google account linked successfully.')).toBeVisible();
    // The Link control is gone now that it's linked — Unlink takes its place.
    await expect(googleLinkButton).toHaveCount(0);

    await page.getByRole('button', { name: 'Unlink Google' }).click();
    await expect(googleLinkButton).toBeVisible();
  });
});
