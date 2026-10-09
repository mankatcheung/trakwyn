import { test, expect, type Page } from '@playwright/test';
import { registerAndLogin, uniqueEmail } from './helpers/auth';
import { createApplication, openTab } from './helpers/applications';

// The panel must work on a laptop and on a phone: the layout differs (sidebar
// navigation vs. an index screen, stacked actions), the behaviour must not.
const VIEWPORTS = [
  { name: 'wide', width: 1440, height: 900 },
  { name: 'narrow', width: 390, height: 844 },
] as const;

const SHOT_DIR = process.env.QA_SCREENSHOT_DIR;

async function shot(page: Page, name: string) {
  if (SHOT_DIR) await page.screenshot({ path: `${SHOT_DIR}/${name}.png`, fullPage: true });
}

/**
 * Sign up and create an application at desktop width, where the shared helpers
 * work, then resize to the width under test. The layout is CSS-responsive, so
 * resizing re-lays the page out without a reload (a reload mid-session races
 * session rehydration, which the helpers avoid for the same reason).
 */
async function openInterviewsAt(page: Page, viewport: { width: number; height: number }) {
  await page.setViewportSize({ width: 1440, height: 900 });
  await registerAndLogin(page, { email: uniqueEmail('iq'), password: 'SecurePass123' });
  await createApplication(page, { company: 'Acme Corp', role: 'Staff Engineer' });
  await page.setViewportSize(viewport);

  if (viewport.width >= 768) {
    await openTab(page, 'Interviews');
  } else {
    // Below the md breakpoint the sections are an index list, one row each.
    await page.getByRole('button', { name: /^Interviews/ }).click();
  }
  await expect(page.getByRole('button', { name: /add interview round/i })).toBeVisible();
}

for (const viewport of VIEWPORTS) {
  test.describe(`Interview questions (${viewport.name}, ${viewport.width}px)`, () => {
    test('records questions and responses against a round, and keeps them after it is passed', async ({
      page,
    }) => {
      await openInterviewsAt(page, viewport);

      // A round to hang questions on.
      await page.getByRole('button', { name: /add interview round/i }).click();
      await page.getByRole('button', { name: /^save$/i }).click();
      const toggle = page.getByRole('button', { name: 'No questions yet' });
      await expect(toggle).toBeVisible();
      await shot(page, `${viewport.name}-1-round-no-questions`);

      // First question: no response.
      await toggle.click();
      await page.getByRole('button', { name: 'Add question' }).click();
      await page.getByLabel('Question', { exact: true }).fill('Describe a hard bug you fixed.');
      await page.getByRole('button', { name: 'Save', exact: true }).click();
      await expect(page.getByText('Describe a hard bug you fixed.')).toBeVisible();
      await expect(page.getByText(/No response recorded yet/)).toBeVisible();
      await expect(page.getByRole('button', { name: '1 question' })).toBeVisible();

      // Second question: with a response.
      await page.getByRole('button', { name: 'Add question' }).click();
      await page.getByLabel('Question', { exact: true }).fill('Why do you want to join?');
      await page
        .getByLabel(/Your response/)
        .fill('The product, and the team’s approach to testing.');
      await page.getByRole('button', { name: 'Save', exact: true }).click();
      await expect(
        page.getByText('The product, and the team’s approach to testing.'),
      ).toBeVisible();
      await expect(page.getByRole('button', { name: '2 questions' })).toBeVisible();
      await shot(page, `${viewport.name}-2-two-questions`);

      // Fill in the missing response later.
      await page.getByRole('button', { name: 'Add response' }).click();
      await page.getByLabel(/Your response/).fill('A race in the cache layer; fixed with a lock.');
      await shot(page, `${viewport.name}-3-editing-response`);
      await page.getByRole('button', { name: 'Save', exact: true }).click();
      await expect(page.getByText('A race in the cache layer; fixed with a lock.')).toBeVisible();
      await expect(page.getByText(/No response recorded yet/)).not.toBeVisible();

      // Reorder: the second question moves above the first.
      await page.getByRole('button', { name: 'Move question up' }).nth(1).click();
      await expect(page.locator('article p.font-semibold').first()).toHaveText(
        'Why do you want to join?',
      );

      // The round is over: mark it passed. The log stays editable.
      await page
        .getByText('Pending', { exact: true })
        .locator('xpath=ancestor::div[contains(@class, "rounded-xl")][1]')
        .locator('button')
        .nth(0)
        .click();
      await page
        .getByText('Outcome', { exact: true })
        .locator('xpath=following-sibling::select')
        .selectOption('passed');
      await page.getByRole('button', { name: /^save$/i }).click();
      await expect(page.getByText('Passed', { exact: true })).toBeVisible();
      await page.getByRole('button', { name: '2 questions' }).click();
      await expect(page.getByRole('button', { name: 'Add question' })).toBeVisible();
      await expect(page.getByRole('button', { name: 'Edit question' }).first()).toBeVisible();
      await shot(page, `${viewport.name}-4-passed-round-expanded`);

      // Delete one; the count follows at once.
      await page.getByRole('button', { name: 'Delete question' }).first().click();
      await expect(page.getByRole('button', { name: '1 question' })).toBeVisible();
    });
  });
}
