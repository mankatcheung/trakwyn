import { test, expect } from '@playwright/test';
import { registerAndLogin, uniqueEmail } from './helpers/auth';

test.describe('Authentication flows', () => {
  test('register, login, and logout', async ({ page }) => {
    const email = uniqueEmail('test');
    const password = 'SecurePass123';

    await registerAndLogin(page, { email, password });

    // Logout
    await page.getByRole('button', { name: /sign out/i }).click();
    await expect(page).toHaveURL(/login/);

    // Login again
    await page.getByPlaceholder('you@example.com').fill(email);
    await page.getByPlaceholder('••••••••').fill(password);
    await page.getByRole('button', { name: /sign in/i }).click();

    await expect(page).toHaveURL(/dashboard/);
  });

  test('shows error for invalid login credentials', async ({ page }) => {
    await page.goto('/login');
    await page.getByPlaceholder('you@example.com').fill('nobody@example.com');
    await page.getByPlaceholder('••••••••').fill('wrongpassword');
    await page.getByRole('button', { name: /sign in/i }).click();

    await expect(page.locator('p.text-red-600')).toBeVisible();
    await expect(page).toHaveURL(/login/);
  });

  test('register offers OAuth first and a show-password toggle instead of a confirm field', async ({
    page,
  }) => {
    await page.goto('/register');
    const google = page.getByRole('link', { name: /sign up with google/i });
    const email = page.getByPlaceholder('you@example.com');
    await expect(page.getByText('Free plan · No credit card')).toBeVisible();
    expect((await google.boundingBox())!.y).toBeLessThan((await email.boundingBox())!.y);

    const password = page.getByPlaceholder('••••••••');
    await expect(password).toHaveCount(1);
    await password.fill('password123');
    await page.getByRole('button', { name: 'Show password' }).click();
    await expect(password).toHaveAttribute('type', 'text');
  });

  test('authenticated users are redirected away from /login', async ({ page }) => {
    await registerAndLogin(page, { email: uniqueEmail('redirect'), password: 'SecurePass123' });

    // Try to visit login
    await page.goto('/login');
    await expect(page).toHaveURL(/dashboard/);
  });

  test('unauthenticated users are redirected to /login from protected routes', async ({ page }) => {
    await page.goto('/dashboard');
    await expect(page).toHaveURL(/login/);
  });
});
