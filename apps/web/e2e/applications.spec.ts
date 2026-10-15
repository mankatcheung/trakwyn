import { test, expect } from '@playwright/test';
import { registerAndLogin, uniqueEmail } from './helpers/auth';
import { chooseApplicationAction } from './helpers/applications';

test.describe('Job applications', () => {
  const password = 'SecurePass123';

  test.beforeEach(async ({ page }) => {
    await registerAndLogin(page, { email: uniqueEmail('apps-test'), password });
  });

  test('creates a new application and it appears in the list', async ({ page }) => {
    // Client-side nav, not page.goto: /applications has a route loader that
    // can race a full-reload's session rehydration (see EditApplicationPage
    // comment below for the same class of issue).
    await page.getByRole('link', { name: 'Applications', exact: true }).click();

    // Create application
    await page.getByRole('link', { name: /new application/i }).click();
    await page.getByPlaceholder('Acme Corp').fill('Stripe');
    await page.getByPlaceholder('Senior Engineer').fill('Software Engineer');
    await page.getByRole('button', { name: /save application/i }).click();

    await expect(page.getByText('Stripe')).toBeVisible();
    await expect(page.getByText('Software Engineer')).toBeVisible();
  });

  test('updates an existing application', async ({ page }) => {
    await page.getByRole('link', { name: 'Applications', exact: true }).click();

    // Create
    await page.getByRole('link', { name: /new application/i }).click();
    await page.getByPlaceholder('Acme Corp').fill('OldCo');
    await page.getByPlaceholder('Senior Engineer').fill('Dev');
    await page.getByRole('button', { name: /save application/i }).click();

    // Navigate into the detail page, then to its edit page (client-side
    // navigation — a full page.goto reload here hits a real app bug: the
    // edit route's loader fetches before client-side auth rehydration
    // finishes, so it 401s into the error boundary).
    await page.getByText('OldCo').click();
    await expect(page).toHaveURL(/\/applications\/[^/]+$/);
    // Star/edit/delete live behind one "More actions" trigger, not as header
    // icon buttons (JEF-208).
    await chooseApplicationAction(page, 'Edit');

    // Edit page pre-fills fields (no placeholder), and label/input aren't
    // associated via htmlFor — target the input via its sibling label text.
    await page
      .getByText('Company *', { exact: true })
      .locator('xpath=following-sibling::input')
      .fill('NewCo');
    await page.getByRole('button', { name: /save changes/i }).click();

    await expect(page.getByText('NewCo')).toBeVisible();
  });

  test('deletes an application', async ({ page }) => {
    await page.getByRole('link', { name: 'Applications', exact: true }).click();

    // Create
    await page.getByRole('link', { name: /new application/i }).click();
    await page.getByPlaceholder('Acme Corp').fill('ToDelete');
    await page.getByPlaceholder('Senior Engineer').fill('QA');
    await page.getByRole('button', { name: /save application/i }).click();

    // Delete — the button just starts a 5s undo-toast timer; the mutation
    // fires and navigates back to /applications once it elapses.
    await page.getByText('ToDelete').click();
    await chooseApplicationAction(page, 'Delete application');
    await page.waitForURL(/\/applications$/, { timeout: 8_000 });

    await expect(page.getByText('ToDelete')).not.toBeVisible();
  });

  test('navigates to dashboard from sidebar', async ({ page }) => {
    await page.getByRole('link', { name: 'Applications', exact: true }).click();
    await page.getByRole('link', { name: /dashboard/i }).click();
    await expect(page).toHaveURL(/dashboard/);
  });

  test('restores applications after returning from the list view to the board', async ({
    page,
  }) => {
    await page.getByRole('link', { name: 'Applications', exact: true }).click();
    await page.getByRole('link', { name: /new application/i }).click();
    await page.getByPlaceholder('Acme Corp').fill('BoardBackCo');
    await page.getByPlaceholder('Senior Engineer').fill('Engineer');
    await page.getByRole('button', { name: /save application/i }).click();

    await page.getByRole('link', { name: 'Applications', exact: true }).click();
    await page.locator('a[href="/applications/board"]').click();
    await expect(page).toHaveURL(/\/applications\/board$/);
    await expect(page.getByText('BoardBackCo')).toBeVisible();

    await page.locator('a[href="/applications"]').first().click();
    await expect(page).toHaveURL(/\/applications$/);
    await expect(page.getByText('BoardBackCo')).toBeVisible();

    await page.goBack();
    await expect(page).toHaveURL(/\/applications\/board$/);
    await expect(page.getByText('BoardBackCo')).toBeVisible();
  });
});
