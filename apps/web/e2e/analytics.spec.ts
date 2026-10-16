import { test, expect } from '@playwright/test';
import { registerAndLogin, uniqueEmail } from './helpers/auth';
import { chooseApplicationAction, createApplication } from './helpers/applications';

test.describe('Analytics', () => {
  test.beforeEach(async ({ page }) => {
    await registerAndLogin(page, { email: uniqueEmail('analytics'), password: 'SecurePass123' });
  });

  test('shows an empty state with no data', async ({ page }) => {
    // Client-side navigation — see the comment in helpers/applications.ts on
    // why a full page.goto to a loader-backed authenticated route can race
    // session rehydration.
    await page.getByRole('link', { name: 'Analytics' }).click();
    await expect(page.getByRole('heading', { name: 'Analytics' })).toBeVisible();
    await expect(page.getByText('Total').locator('xpath=following-sibling::p')).toHaveText('0');
    await expect(page.getByText('No data yet.')).toHaveCount(2);
  });

  test('reflects created applications in the totals and charts', async ({ page }) => {
    await createApplication(page, { company: 'Acme Corp', role: 'Staff Engineer' });
    // Star/edit/delete live behind one "More actions" trigger, not as header
    // icon buttons (JEF-208).
    await chooseApplicationAction(page, 'Edit');
    await page
      .getByText('Status', { exact: true })
      .locator('xpath=following-sibling::select')
      .selectOption('interviewing');
    await page.getByRole('button', { name: /save changes/i }).click();

    await createApplication(page, { company: 'Globex', role: 'Backend Engineer' });

    // Client-side navigation — see the comment in helpers/applications.ts on
    // why a full page.goto to a loader-backed authenticated route can race
    // session rehydration.
    await page.getByRole('link', { name: 'Analytics' }).click();
    await expect(page.getByRole('heading', { name: 'Analytics' })).toBeVisible();

    await expect(page.getByText('Total').locator('xpath=following-sibling::p')).toHaveText('2');
    await expect(page.getByText('Active').locator('xpath=following-sibling::p')).toHaveText('1');

    await expect(page.getByText('Applications per week')).toBeVisible();
    await expect(page.getByText('Stage funnel')).toBeVisible();
    await expect(page.getByText('No data yet.')).toHaveCount(0);
  });
});
