import { test, expect } from '@playwright/test';
import { registerAndLogin, uniqueEmail } from './helpers/auth';
import { createApplication, openTab } from './helpers/applications';

async function fillField(page: import('@playwright/test').Page, label: string, value: string) {
  await page
    .getByText(label, { exact: true })
    .locator('xpath=following-sibling::input')
    .fill(value);
}

async function addOffer(page: import('@playwright/test').Page, baseSalary: string) {
  await page.getByRole('button', { name: /add offer/i }).click();
  await fillField(page, 'Base Salary *', baseSalary);
  await page.getByRole('button', { name: /save offer/i }).click();
  await expect(page.getByText(`$${Number(baseSalary).toLocaleString()}/yr`)).toBeVisible();
}

test.describe('Offers', () => {
  test.beforeEach(async ({ page }) => {
    await registerAndLogin(page, { email: uniqueEmail('offers'), password: 'SecurePass123' });
    await createApplication(page, { company: 'Acme Corp', role: 'Staff Engineer' });
    await openTab(page, 'Offers');
  });

  test('adds an offer and shows it in the list', async ({ page }) => {
    await page.getByRole('link', { name: /manage offers/i }).click();
    await expect(page.getByRole('heading', { name: 'Offers' })).toBeVisible();
    await expect(page.getByText(/no offers yet/i)).toBeVisible();

    await addOffer(page, '150000');
  });

  test('compares two offers on the user-level offers page and highlights the best one', async ({
    page,
  }) => {
    await page.getByRole('link', { name: /manage offers/i }).click();

    await addOffer(page, '150000');
    await addOffer(page, '130000');

    // Compare now lives on the top-level /offers page, which lists every
    // offer across every application — not on the per-application offers tab.
    await page.goto('/offers');
    await expect(page.getByRole('heading', { name: 'All Offers' })).toBeVisible();

    await page.getByText('$150,000/yearly').click();
    await page.getByText('$130,000/yearly').click();
    await page.getByRole('button', { name: /compare \(2\)/i }).click();

    await expect(page.getByText('Acme Corp').first()).toBeVisible();
    await expect(page.getByText('Best')).toBeVisible();
    // Both rows are for the same application — the higher offer wins.
    const rows = page.locator('tbody tr');
    await expect(rows).toHaveCount(2);
  });

  test('selecting all offers on the user-level page enables compare for every offer', async ({
    page,
  }) => {
    await page.getByRole('link', { name: /manage offers/i }).click();
    await addOffer(page, '150000');
    await addOffer(page, '130000');

    await page.goto('/offers');
    await page.getByRole('button', { name: /select all/i }).click();
    await expect(page.getByRole('button', { name: /compare \(2\)/i })).toBeEnabled();
  });
});
