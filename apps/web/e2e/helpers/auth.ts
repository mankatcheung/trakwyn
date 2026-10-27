import type { Page } from '@playwright/test';
import { expect } from '@playwright/test';

export const uniqueEmail = (prefix: string) =>
  `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@e2e.example.com`;

/**
 * Registers a new account, landing on /dashboard.
 *
 * Registration shows a "Check your email" screen first. `register` also signs
 * the user in, so its "Continue" link goes straight to /dashboard. In e2e the
 * API auto-verifies new accounts (AUTO_VERIFY_EMAIL defaults on outside
 * production, JEF-438), so the dashboard is not hidden behind the
 * verification wall.
 */
export async function registerAndLogin(
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

  await expect(page).toHaveURL(/dashboard/);
}
