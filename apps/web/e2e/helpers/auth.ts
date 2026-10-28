import type { Page } from '@playwright/test';
import { expect } from '@playwright/test';

export const uniqueEmail = (prefix: string) =>
  `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@e2e.example.com`;

/**
 * Registers a new account and stops on the first-run welcome flow (JEF-460).
 *
 * Registration shows a "Check your email" screen first. `register` also signs
 * the user in, so its "Continue" link goes on into the app, where a new
 * account is sent to /welcome. In e2e the API auto-verifies new accounts
 * (AUTO_VERIFY_EMAIL defaults on outside production, JEF-438), so the app is
 * not hidden behind the verification wall.
 */
export async function registerToWelcome(
  page: Page,
  { email, password }: { email: string; password: string },
): Promise<void> {
  await page.goto('/register');
  await page.getByPlaceholder('you@example.com').fill(email);
  const [passwordInput, confirmInput] = await page.getByPlaceholder('••••••••').all();
  await passwordInput.fill(password);
  await confirmInput.fill(password);
  await page.getByRole('button', { name: /create account/i }).click();

  await expect(page.getByRole('heading', { name: /check your email/i })).toBeVisible();
  await page.getByRole('link', { name: /^continue$/i }).click();

  await expect(page).toHaveURL(/\/welcome/);
}

/**
 * Registers a new account and skips the welcome flow, landing on /dashboard.
 * Specs about anything other than the welcome flow start here.
 */
export async function registerAndLogin(
  page: Page,
  credentials: { email: string; password: string },
): Promise<void> {
  await registerToWelcome(page, credentials);
  await page.getByRole('button', { name: /skip setup/i }).click();

  await expect(page).toHaveURL(/dashboard/);
}

/**
 * After an OAuth sign-in: the fake provider's account is new on a fresh
 * database (welcome flow) and an old one on a reused local one (dashboard).
 * Either way the spec continues from the dashboard.
 */
export async function skipWelcomeIfShown(page: Page): Promise<void> {
  await expect(page).toHaveURL(/\/(welcome|dashboard)/);
  if (new URL(page.url()).pathname === '/welcome') {
    await page.getByRole('button', { name: /skip setup/i }).click();
  }
  await expect(page).toHaveURL(/dashboard/);
}
