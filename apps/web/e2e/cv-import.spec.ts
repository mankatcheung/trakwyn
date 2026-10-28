import { test, expect, type Page } from '@playwright/test';
import { registerAndLogin, uniqueEmail } from './helpers/auth';

/**
 * JEF-461: import the profile from a CV. Runs against the real API with the
 * real text extractor and the fake model (LLM_PROVIDER_MODE=fake), which reads
 * any CV as two roles, one degree and three skills. The file is never stored;
 * that is asserted at the API (cvImport.routes.integration.test.ts).
 */

// Same two widths as the other specs: the layout differs between a laptop and
// a phone, the behaviour must not.
const VIEWPORTS = [
  { name: 'wide', width: 1440, height: 900 },
  { name: 'narrow', width: 390, height: 844 },
] as const;

const FAKE_LLM_URL = 'http://localhost:3001/llm-test/fake/chat/completions';
const SHOT_DIR = process.env.QA_SCREENSHOT_DIR;

const CV = {
  name: 'jane-doe-cv.txt',
  mimeType: 'text/plain',
  buffer: Buffer.from(
    [
      'Jane Doe',
      'Senior Engineer, Acme Corp (Remote), March 2020 to present',
      'Software Engineer, Globex (London), June 2016 to February 2020',
      'BS Computer Science, State University, 2012 to 2016',
      'Skills: TypeScript, PostgreSQL, communication',
    ].join('\n'),
  ),
};

async function shot(page: Page, name: string) {
  if (SHOT_DIR)
    await page.screenshot({ path: `${SHOT_DIR}/cv-import-${name}.png`, fullPage: true });
}

/**
 * Points the "Custom (OpenAI-compatible)" provider at the API's own fake
 * endpoint, as the assistant and interview specs do, so reading a CV needs no
 * live key.
 */
async function setupFakeAiProvider(page: Page): Promise<void> {
  await page.goto('/settings/ai');
  await page.locator('select').selectOption('custom');
  await page.getByPlaceholder('sk-…').fill('fake-api-key');
  await page
    .getByPlaceholder('https://your-endpoint.example.com/v1/chat/completions')
    .fill(FAKE_LLM_URL);
  await page.getByPlaceholder('e.g. gpt-4o-mini').fill('fake-model');
  await page.getByRole('button', { name: 'Add key' }).click();
  await expect(page.getByText('Custom (OpenAI-compatible)')).toBeVisible();
}

async function openProfileAt(
  page: Page,
  viewport: { width: number; height: number },
  options: { withAiKey: boolean },
) {
  await page.setViewportSize({ width: 1440, height: 900 });
  await registerAndLogin(page, { email: uniqueEmail('cv'), password: 'SecurePass123' });
  if (options.withAiKey) await setupFakeAiProvider(page);
  await page.setViewportSize(viewport);
  await page.goto('/profile');
  await expect(page.getByRole('heading', { name: 'My profile' })).toBeVisible();
}

const openImport = async (page: Page) => {
  await page.getByRole('button', { name: 'Import from CV' }).click();
  await expect(page.getByRole('dialog', { name: 'Import from your CV' })).toBeVisible();
};

const chooseCv = (page: Page) => page.getByTestId('cv-import-input').setInputFiles(CV);

async function expectNoHorizontalScroll(page: Page) {
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
}

for (const viewport of VIEWPORTS) {
  test.describe(`CV import (${viewport.name}, ${viewport.width}px)`, () => {
    test('reads a CV, lets the user review it, and adds the ticked rows to the profile', async ({
      page,
    }) => {
      await openProfileAt(page, viewport, { withAiKey: true });
      await openImport(page);
      const dialog = page.getByRole('dialog');
      await expect(dialog.getByText('PDF, DOCX or TXT, up to 10 MB')).toBeVisible();
      await expect(dialog.getByText(/Trakwyn does not save it/)).toBeVisible();
      await shot(page, `${viewport.name}-1-picker`);

      await chooseCv(page);

      await expect(dialog.getByText('Senior Engineer at Acme Corp')).toBeVisible();
      await expect(dialog.getByText('Software Engineer at Globex')).toBeVisible();
      await expect(dialog.getByText('State University')).toBeVisible();
      await expect(dialog.getByText('TypeScript')).toBeVisible();
      const importButton = dialog.getByRole('button', { name: /^Import \d+ selected$/ });
      await expect(importButton).toHaveText('Import 6 selected');
      await shot(page, `${viewport.name}-2-review`);

      // Drop a skill, and edit a title before importing.
      await dialog.getByRole('checkbox', { name: 'Include Communication' }).uncheck();
      await expect(importButton).toHaveText('Import 5 selected');
      // By position, not by name: the checkbox is named after the title, which
      // is about to change.
      const role = dialog.getByRole('listitem').first();
      await role.getByRole('button', { name: 'Edit' }).click();
      await role.getByLabel('Title *').fill('Staff Engineer');
      await shot(page, `${viewport.name}-3-editing`);
      await role.getByRole('button', { name: 'Done' }).click();

      await importButton.click();

      await expect(page.getByRole('dialog')).toBeHidden();
      await expect(
        page.getByText('Added from your CV: 2 work experience, 1 education, 2 skills.'),
      ).toBeVisible();
      await expect(page.getByText('Staff Engineer at Acme Corp')).toBeVisible();
      await expect(page.getByText('Software Engineer at Globex')).toBeVisible();
      await expect(page.getByText('State University')).toBeVisible();
      await expect(page.getByText('TypeScript')).toBeVisible();
      await expect(page.getByText('Communication')).toHaveCount(0);
      await shot(page, `${viewport.name}-4-profile`);
    });

    test('flags what the profile already has when the same CV is imported again', async ({
      page,
    }) => {
      await openProfileAt(page, viewport, { withAiKey: true });
      await openImport(page);
      await chooseCv(page);
      const dialog = page.getByRole('dialog');
      await dialog.getByRole('button', { name: /^Import \d+ selected$/ }).click();
      await expect(page.getByRole('dialog')).toBeHidden();

      await openImport(page);
      await chooseCv(page);

      // Everything but the soft skill the first pass imported too is already there.
      await expect(dialog.getByText('Already in your profile')).toHaveCount(6);
      await expect(dialog.getByRole('button', { name: 'Import 0 selected' })).toBeDisabled();
      await shot(page, `${viewport.name}-5-already-there`);
    });

    test('turns away a wrong file without sending anything', async ({ page }) => {
      await openProfileAt(page, viewport, { withAiKey: true });
      const uploads: string[] = [];
      page.on('request', (request) => {
        if (request.url().includes('/profile/cv-import')) uploads.push(request.url());
      });
      await openImport(page);
      const dialog = page.getByRole('dialog');

      await page
        .getByTestId('cv-import-input')
        .setInputFiles({ name: 'photo.png', mimeType: 'image/png', buffer: Buffer.from('x') });
      await expect(dialog.getByRole('alert')).toContainText('PDF, DOCX or TXT file');

      await page.getByTestId('cv-import-input').setInputFiles({
        name: 'old.doc',
        mimeType: 'application/msword',
        buffer: Buffer.from('x'),
      });
      await expect(dialog.getByRole('alert')).toContainText("Old Word .doc files aren't supported");
      await shot(page, `${viewport.name}-6-refused`);

      expect(uploads).toEqual([]);
    });

    test('sends a user with no AI key to Settings', async ({ page }) => {
      await openProfileAt(page, viewport, { withAiKey: false });
      await openImport(page);

      await chooseCv(page);

      const alert = page.getByRole('dialog').getByRole('alert');
      await expect(alert).toContainText('Add your AI API key');
      await expect(alert.getByRole('link')).toHaveAttribute('href', '/settings/ai');
      await shot(page, `${viewport.name}-7-no-key`);
    });

    test('closes with Escape and fits the screen', async ({ page }) => {
      await openProfileAt(page, viewport, { withAiKey: true });
      await openImport(page);
      await chooseCv(page);
      const dialog = page.getByRole('dialog');
      await expect(dialog.getByText('Senior Engineer at Acme Corp')).toBeVisible();

      const box = await dialog.boundingBox();
      expect(box!.width).toBeLessThanOrEqual(viewport.width);
      expect(box!.height).toBeLessThanOrEqual(viewport.height);
      await expectNoHorizontalScroll(page);

      await page.keyboard.press('Escape');
      await expect(dialog).toBeHidden();
      // Nothing was saved.
      await expect(page.getByText('No work experiences added yet.')).toBeVisible();
    });
  });
}
