import { test, expect } from '@playwright/test';
import { registerToWelcome, uniqueEmail } from './helpers/auth';

const PASSWORD = 'SecurePass123';

test.describe('First-run welcome flow (JEF-460)', () => {
  test('a new account is sent to it, and skipping it means it never shows again', async ({
    page,
  }) => {
    await registerToWelcome(page, { email: uniqueEmail('welcome-skip'), password: PASSWORD });
    await expect(page.getByRole('heading', { name: 'Welcome to Trakwyn' })).toBeVisible();

    await page.getByRole('button', { name: /skip setup/i }).click();
    await expect(page).toHaveURL(/dashboard/);

    // Neither another page nor the flow's own address brings it back.
    await page.goto('/applications');
    await expect(page).toHaveURL(/\/applications/);
    await page.goto('/welcome');
    await expect(page).toHaveURL(/dashboard/);
  });

  test('tracking alone goes straight to a new application', async ({ page }) => {
    await registerToWelcome(page, { email: uniqueEmail('welcome-track'), password: PASSWORD });

    await page.getByRole('button', { name: /get started/i }).click();
    await page.getByRole('checkbox', { name: /track my applications/i }).check();
    await page.getByRole('button', { name: /^continue$/i }).click();
    await page.getByRole('button', { name: /add your first application/i }).click();

    await expect(page).toHaveURL(/\/applications\/new/);
  });

  test('an AI goal asks for the profile, and what is added there is on /profile', async ({
    page,
  }) => {
    await registerToWelcome(page, { email: uniqueEmail('welcome-ai'), password: PASSWORD });

    await page.getByRole('button', { name: /get started/i }).click();
    await page.getByRole('checkbox', { name: /write resumes and cover letters/i }).check();
    await page.getByRole('button', { name: /^continue$/i }).click();
    await expect(
      page.getByRole('heading', { name: 'Tell us about your experience' }),
    ).toBeVisible();

    const skills = page.locator('#skills');
    await skills.getByRole('button', { name: /add/i }).click();
    const form = skills.locator('form');
    await form.getByPlaceholder(/typescript/i).fill('Kubernetes');
    await form.getByRole('button', { name: /^add$/i }).click();
    await expect(skills.getByText('Kubernetes')).toBeVisible();

    await page.getByRole('button', { name: /^continue$/i }).click();
    await expect(page.getByRole('heading', { name: 'Connect your AI provider' })).toBeVisible();
    await page.getByRole('button', { name: /skip this step/i }).click();
    await page.getByRole('button', { name: /go to the dashboard/i }).click();
    await expect(page).toHaveURL(/dashboard/);

    await page.goto('/profile');
    await expect(page.locator('#skills').getByText('Kubernetes')).toBeVisible();
  });
});
