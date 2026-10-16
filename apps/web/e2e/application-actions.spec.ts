import { test, expect } from '@playwright/test';
import { registerAndLogin, uniqueEmail } from './helpers/auth';
import { createApplication } from './helpers/applications';

// Screenshots for a human to look at, written beside the other Playwright
// output (gitignored); they are not compared against a baseline.
const shot = (name: string) => `test-results/application-actions-${name}.png`;

test.describe('Application actions (JEF-404)', () => {
  test.beforeEach(async ({ page }) => {
    await registerAndLogin(page, { email: uniqueEmail('app-actions'), password: 'SecurePass123' });
    await createApplication(page, { company: 'Acme Corp', role: 'Staff Engineer' });
  });

  test('is a popover next to the button on a wide screen', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    const trigger = page.getByRole('button', { name: 'More actions' });
    await trigger.click();

    const menu = page.getByRole('menu', { name: 'More actions' });
    await expect(menu).toBeVisible();
    await expect(page.getByRole('dialog')).toHaveCount(0);

    // Anchored under the button, not pinned to the bottom of the window.
    const triggerBox = await trigger.boundingBox();
    const menuBox = await menu.boundingBox();
    expect(menuBox!.y).toBeGreaterThan(triggerBox!.y);
    expect(menuBox!.y).toBeLessThan(triggerBox!.y + triggerBox!.height + 24);
    await page.screenshot({ path: shot('popover-1440') });

    await page.keyboard.press('Escape');
    await expect(menu).toBeHidden();
    await expect(trigger).toBeFocused();
  });

  test('changes status from the second pane', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.getByRole('button', { name: 'More actions' }).click();
    await page.getByRole('menuitem', { name: 'Change status' }).click();

    // A new application starts as a draft.
    await expect(page.getByRole('menuitem', { name: 'Draft' })).toHaveAttribute(
      'aria-current',
      'true',
    );
    await page.screenshot({ path: shot('status-pane-1440') });

    await page.getByRole('menuitem', { name: 'Interviewing' }).click();

    await expect(page.getByRole('menu')).toHaveCount(0);
    await expect(page.getByText('Interviewing', { exact: true }).first()).toBeVisible();
  });

  test('is still the bottom sheet on a phone', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.getByRole('button', { name: 'More actions' }).click();

    const sheet = page.getByRole('dialog');
    await expect(sheet).toBeVisible();
    await expect(page.getByRole('menu')).toHaveCount(0);
    await expect(sheet.getByRole('button', { name: 'Delete application' })).toBeVisible();
    await page.screenshot({ path: shot('sheet-390') });
  });
});
