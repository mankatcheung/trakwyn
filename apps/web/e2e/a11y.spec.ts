import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { registerAndLogin, registerToWelcome, uniqueEmail } from './helpers/auth';

/**
 * Accessibility (axe-core) scans for key public pages.
 *
 * These tests run axe-core against rendered pages and assert zero
 * violations.  Violations that are impractical to fix (e.g. color-
 * contrast on brand-coloured elements) can be disabled per-scan via
 * AxeBuilder’s `disableRules()` or `exclude()`.
 *
 * Deliberately not using `waitForLoadState('networkidle')` — something on
 * these pages (likely TanStack Devtools or the Vite HMR client) keeps a
 * connection open indefinitely, so networkidle never resolves. Waiting for
 * a concrete piece of rendered UI is both faster and more reliable.
 */

/** Run an axe scan and assert zero violations. */
async function scan(page: import('@playwright/test').Page, label: string) {
  // Every element has a 150ms color/background/border-color transition
  // (see `body, body *` in styles.css, there for a smooth dark-mode
  // toggle). Newly-mounted or just-navigated-to content can still be
  // mid-transition when axe reads computed styles, which produces
  // transient, artificially low color-contrast readings that don't
  // reflect the settled page. Give it a beat to finish.
  await page.waitForTimeout(250);
  const results = await new AxeBuilder({ page }).analyze();
  expect(results.violations, `A11y violations on ${label}`).toEqual([]);
}

test.describe('Accessibility scans – public pages', () => {
  test('login page passes axe', async ({ page }) => {
    await page.goto('/login');
    await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible();
    await scan(page, '/login');
  });

  test('register page passes axe', async ({ page }) => {
    await page.goto('/register');
    await expect(page.getByRole('heading', { name: 'Create account' })).toBeVisible();
    await scan(page, '/register');
  });

  test('forgot-password page passes axe', async ({ page }) => {
    await page.goto('/forgot-password');
    await expect(page.getByRole('heading', { name: /forgot your password/i })).toBeVisible();
    await scan(page, '/forgot-password');
  });
});

test.describe('Accessibility scans – authenticated pages', () => {
  test.beforeEach(async ({ page }) => {
    // The sidebar staggers its nav items in with a fade/slide entrance
    // animation. Scanning mid-animation catches elements at a transient,
    // partial opacity and reports false-positive color-contrast violations
    // that aren't representative of the settled page. Respecting
    // prefers-reduced-motion scans the same steady state a motion-sensitive
    // user would see — the app's own CSS already disables these animations
    // for that preference (see .sidebar-entrance-item in styles.css).
    // Using `page.emulateMedia` directly rather than the `reducedMotion`
    // test/context option — the latter didn't reliably flip
    // `prefers-reduced-motion` for this app's CSS in practice.
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await registerAndLogin(page, { email: uniqueEmail('a11y'), password: 'SecurePass123' });
  });

  test('dashboard page passes axe', async ({ page }) => {
    await scan(page, '/dashboard');
  });

  test('applications page passes axe', async ({ page }) => {
    await page.goto('/applications');
    await expect(page.getByRole('heading', { name: 'Applications' })).toBeVisible();
    await scan(page, '/applications');
  });
});

test.describe('Accessibility scans – first-run welcome flow (JEF-460)', () => {
  test.beforeEach(async ({ page }) => {
    // Same reason as the authenticated pages above: scan the settled page.
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await registerToWelcome(page, {
      email: uniqueEmail('a11y-welcome'),
      password: 'SecurePass123',
    });
  });

  test('the welcome and goals steps pass axe', async ({ page }) => {
    await expect(page.getByRole('heading', { name: 'Welcome to Trakwyn' })).toBeVisible();
    await scan(page, '/welcome (intro)');

    await page.getByRole('button', { name: /get started/i }).click();
    await page.getByRole('checkbox', { name: /ask the assistant/i }).check();
    await expect(page.getByRole('heading', { name: 'What do you want help with?' })).toBeVisible();
    await scan(page, '/welcome (goals)');
  });
});
