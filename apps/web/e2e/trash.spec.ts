import { test, expect } from '@playwright/test';
import { registerAndLogin, uniqueEmail } from './helpers/auth';
import { chooseApplicationAction } from './helpers/applications';

async function createApplication(page: import('@playwright/test').Page, company: string) {
  await page.getByRole('link', { name: 'Applications', exact: true }).click();
  await page.getByRole('link', { name: /new application/i }).click();
  await page.getByPlaceholder('Acme Corp').fill(company);
  await page.getByPlaceholder('Senior Engineer').fill('Engineer');
  await page.getByRole('button', { name: /save application/i }).click();
  await expect(page.getByText(company)).toBeVisible();
}

test.describe('Trash', () => {
  const password = 'SecurePass123';

  test.beforeEach(async ({ page }) => {
    await registerAndLogin(page, { email: uniqueEmail('trash-test'), password });
  });

  test('deleting an application moves it to Trash, and it can be restored', async ({ page }) => {
    await createApplication(page, 'TrashCo');

    // Delete from the detail page — same path as applications.spec.ts's
    // "deletes an application", which already covers the immediate-delete +
    // navigate-away behavior (JEF-190). This test picks up from there.
    await page.getByText('TrashCo').click();
    await chooseApplicationAction(page, 'Delete application');
    await page.waitForURL(/\/applications$/, { timeout: 8_000 });

    await expect(page.getByText('TrashCo')).not.toBeVisible();

    await page.getByRole('link', { name: 'Trash' }).click();
    await expect(page).toHaveURL(/\/applications\/trash$/);
    await expect(page.getByText('TrashCo')).toBeVisible();

    await page.getByRole('button', { name: 'Restore TrashCo' }).click();
    await expect(page.getByText('Application restored')).toBeVisible();
    await expect(page.getByText('TrashCo')).not.toBeVisible();

    await page.getByRole('link', { name: 'Applications', exact: true }).click();
    await expect(page.getByText('TrashCo')).toBeVisible();
  });

  test('bulk-selects and restores multiple applications from Trash', async ({ page }) => {
    await createApplication(page, 'BulkA');
    await createApplication(page, 'BulkB');

    // Move both to Trash via the list page's bulk-delete bar, rather than the
    // detail page — exercises deleteApplicationsWithUndo (the bulk sibling of
    // the single-delete path already covered elsewhere).
    await page.getByRole('link', { name: 'Applications', exact: true }).click();
    await page.getByRole('checkbox', { name: 'Select BulkA' }).check();
    await page.getByRole('checkbox', { name: 'Select BulkB' }).check();
    await page.getByRole('button', { name: 'Delete selected' }).click();

    await expect(page.getByText('BulkA')).not.toBeVisible();
    await expect(page.getByText('BulkB')).not.toBeVisible();

    await page.getByRole('link', { name: 'Trash' }).click();
    await expect(page.getByText('BulkA')).toBeVisible();
    await expect(page.getByText('BulkB')).toBeVisible();

    await page.getByRole('checkbox', { name: 'Select BulkA' }).check();
    await page.getByRole('checkbox', { name: 'Select BulkB' }).check();
    await page.getByRole('button', { name: 'Restore selected' }).click();

    await expect(page.getByText('2 applications restored')).toBeVisible();
    await expect(page.getByText('BulkA')).not.toBeVisible();
    await expect(page.getByText('BulkB')).not.toBeVisible();

    await page.getByRole('link', { name: 'Applications', exact: true }).click();
    await expect(page.getByText('BulkA')).toBeVisible();
    await expect(page.getByText('BulkB')).toBeVisible();
  });

  test('undoing a delete within the toast window restores it without visiting Trash', async ({
    page,
  }) => {
    await createApplication(page, 'UndoCo');

    await page.getByText('UndoCo').click();
    await chooseApplicationAction(page, 'Delete application');
    await page.waitForURL(/\/applications$/, { timeout: 8_000 });

    await expect(page.getByText('Application deleted')).toBeVisible();
    await page.getByRole('button', { name: 'Undo' }).click();

    await expect(page.getByText('Application restored')).toBeVisible();
    await expect(page.getByText('UndoCo')).toBeVisible();

    // Never made it to (or was cleared from) Trash.
    await page.getByRole('link', { name: 'Trash' }).click();
    await expect(page.getByText('UndoCo')).not.toBeVisible();
  });

  test('permanently deletes a single application forever from Trash', async ({ page }) => {
    await createApplication(page, 'ForeverCo');

    await page.getByText('ForeverCo').click();
    await chooseApplicationAction(page, 'Delete application');
    await page.waitForURL(/\/applications$/, { timeout: 8_000 });

    await page.getByRole('link', { name: 'Trash' }).click();
    await expect(page.getByText('ForeverCo')).toBeVisible();

    // "Delete forever" goes through a native window.confirm(), unlike Empty
    // Trash's own Modal dialog below.
    page.once('dialog', (dialog) => dialog.accept());
    await page.getByRole('button', { name: 'Permanently delete ForeverCo' }).click();

    await expect(page.getByText('Application permanently deleted')).toBeVisible();
    await expect(page.getByText('ForeverCo')).not.toBeVisible();
  });

  test('empties the trash from the confirmation dialog', async ({ page }) => {
    await createApplication(page, 'EmptyMeCo');

    await page.getByText('EmptyMeCo').click();
    await chooseApplicationAction(page, 'Delete application');
    await page.waitForURL(/\/applications$/, { timeout: 8_000 });

    await page.getByRole('link', { name: 'Trash' }).click();
    await expect(page.getByText('EmptyMeCo')).toBeVisible();

    await page.getByRole('button', { name: 'Empty Trash' }).click();
    await page.getByRole('button', { name: /delete 1 forever/i }).click();

    await expect(page.getByText('Trash emptied')).toBeVisible();
    await expect(page.getByText('Trash is empty')).toBeVisible();
  });
});
