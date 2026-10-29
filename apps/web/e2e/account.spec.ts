import { test, expect } from '@playwright/test';
import { registerAndLogin, uniqueEmail } from './helpers/auth';

test.describe('Account settings', () => {
  const password = 'SecurePass123';
  let email: string;

  test.beforeEach(async ({ page }) => {
    email = uniqueEmail('account-test');
    await registerAndLogin(page, { email, password });
    await page.goto('/settings/security');
  });

  test('renders all account sections', async ({ page }) => {
    await expect(page.getByText('Password', { exact: true })).toBeVisible();

    // Email address now lives on Profile, split out of Security (JEF-204).
    await page.goto('/settings/profile');
    await expect(page.getByText('Email address')).toBeVisible();

    await page.goto('/settings/data');
    await expect(page.getByText('Export your data')).toBeVisible();

    // Danger zone is its own page, split out of Data (JEF-204). Scoped to
    // the heading, not a plain getByText: the settings sub-nav link is
    // labeled "Danger zone" too, so the bare text matches both the link
    // and this page's own heading.
    await page.goto('/settings/danger-zone');
    await expect(page.getByRole('heading', { name: 'Danger zone' })).toBeVisible();
  });

  test('updates email with correct password', async ({ page }) => {
    // Now a confirm-by-email flow (requestEmailChange), not an immediate
    // change — the only client-visible signal of success is the form
    // resetting (no success banner is shown).
    await page.goto('/settings/profile');
    const newEmail = uniqueEmail('new');
    const emailSection = page.locator('div.rounded-xl').filter({ hasText: 'Email address' });
    const newEmailInput = emailSection.getByPlaceholder('you@example.com');

    await emailSection.getByPlaceholder('••••••••').fill(password);
    await newEmailInput.fill(newEmail);
    await emailSection.getByRole('button', { name: /update email/i }).click();

    await expect(newEmailInput).toHaveValue('');
  });

  test('shows error when updating email with wrong password', async ({ page }) => {
    await page.goto('/settings/profile');
    const emailSection = page.locator('div.rounded-xl').filter({ hasText: 'Email address' });

    await emailSection.getByPlaceholder('••••••••').fill('wrongpassword');
    await emailSection.getByPlaceholder('you@example.com').fill(uniqueEmail('wrong'));
    await emailSection.getByRole('button', { name: /update email/i }).click();

    await expect(emailSection.locator('p.text-red-600')).toBeVisible();
  });

  test('updates password with correct current password', async ({ page }) => {
    const newPassword = 'NewSecurePass456';
    const passwordSection = page.locator('div.rounded-xl').filter({ hasText: /^Password/ });
    const inputs = passwordSection.locator('input[type="password"]');

    await inputs.nth(0).fill(password);
    await inputs.nth(1).fill(newPassword);
    await inputs.nth(2).fill(newPassword);
    await passwordSection.getByRole('button', { name: /update password/i }).click();

    await expect(passwordSection.getByText('Password updated successfully.')).toBeVisible();
  });

  test('shows error when new passwords do not match', async ({ page }) => {
    const passwordSection = page.locator('div.rounded-xl').filter({ hasText: /^Password/ });
    const inputs = passwordSection.locator('input[type="password"]');

    await inputs.nth(0).fill(password);
    await inputs.nth(1).fill('newPass1234');
    await inputs.nth(2).fill('differentPass');
    await passwordSection.getByRole('button', { name: /update password/i }).click();

    await expect(passwordSection.getByText('Passwords do not match')).toBeVisible();
  });

  // Deleting only starts here (JEF-463): the API mails a link, and the link schedules the
  // deletion two weeks out. E2E has no inbox, so confirm, the grace period and the purge are
  // covered end to end by apps/api's accountDeletion.integration.test.ts.
  test('keeps delete off until the account email is typed, and asks for no password', async ({
    page,
  }) => {
    await page.goto('/settings/danger-zone');
    const confirmEmail = page.getByLabel(`Type ${email} to confirm`);
    const deleteButton = page.getByRole('button', { name: /delete my account/i });

    await expect(page.getByPlaceholder('••••••••')).toHaveCount(0);
    await confirmEmail.fill('someone-else@example.com');
    await expect(deleteButton).toBeDisabled();
    await confirmEmail.fill(email);
    await expect(deleteButton).toBeEnabled();
  });

  test('requesting deletion mails a link and leaves the account working', async ({ page }) => {
    await page.goto('/settings/danger-zone');
    await page.getByLabel(`Type ${email} to confirm`).fill(email);
    await page.getByRole('button', { name: /delete my account/i }).click();

    await expect(page.getByText(`Check ${email}`)).toBeVisible();
    // Nothing is deleted until the link is used: still signed in, app still open.
    await page.goto('/dashboard');
    await expect(page).toHaveURL(/dashboard/);
  });

  test('a confirmation link that is not real is refused and changes nothing', async ({ page }) => {
    await page.goto('/confirm-account-deletion?token=not-a-real-token');
    await page.getByRole('button', { name: /delete my account/i }).click();

    await expect(page.getByText(/invalid or has expired/i)).toBeVisible();
    await page.goto('/dashboard');
    await expect(page).toHaveURL(/dashboard/);
  });
});
