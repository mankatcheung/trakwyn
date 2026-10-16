import { test, expect, type Page } from '@playwright/test';
import { registerAndLogin, uniqueEmail } from './helpers/auth';
import { createApplication, openTab } from './helpers/applications';

// Same two widths as the interview questions spec: the layout differs between
// a laptop and a phone, the behaviour must not.
const VIEWPORTS = [
  { name: 'wide', width: 1440, height: 900 },
  { name: 'narrow', width: 390, height: 844 },
] as const;

const FAKE_LLM_URL = 'http://localhost:3001/llm-test/fake/chat/completions';
const SHOT_DIR = process.env.QA_SCREENSHOT_DIR;

async function shot(page: Page, name: string) {
  if (SHOT_DIR) await page.screenshot({ path: `${SHOT_DIR}/${name}.png`, fullPage: true });
}

/**
 * Points the "Custom (OpenAI-compatible)" provider at the API's own fake
 * endpoint (registered only under LLM_PROVIDER_MODE=fake), as the assistant
 * spec does, so generating needs no live key.
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

async function openInterviewsAt(
  page: Page,
  viewport: { width: number; height: number },
  options: { withAiKey: boolean },
) {
  await page.setViewportSize({ width: 1440, height: 900 });
  await registerAndLogin(page, { email: uniqueEmail('ip'), password: 'SecurePass123' });
  if (options.withAiKey) await setupFakeAiProvider(page);
  await createApplication(page, { company: 'Acme Corp', role: 'Staff Engineer' });
  await page.setViewportSize(viewport);

  if (viewport.width >= 768) {
    await openTab(page, 'Interviews');
  } else {
    await page.getByRole('button', { name: /^Interviews/ }).click();
  }
  await expect(page.getByRole('button', { name: /add interview round/i })).toBeVisible();
}

async function addRoundAndOpenPractice(page: Page) {
  await page.getByRole('button', { name: /add interview round/i }).click();
  await page.getByRole('button', { name: /^save$/i }).click();
  await page.getByRole('button', { name: 'Practice questions', exact: true }).click();
}

for (const viewport of VIEWPORTS) {
  test.describe(`Practice interview questions (${viewport.name}, ${viewport.width}px)`, () => {
    test('generates questions, keeps the ones picked, and drafts an AI-labelled answer', async ({
      page,
    }) => {
      await openInterviewsAt(page, viewport, { withAiKey: true });
      await addRoundAndOpenPractice(page);
      await shot(page, `${viewport.name}-1-practice-empty`);

      // Suggestions are reviewed first: nothing is saved until "Add".
      await page.getByRole('button', { name: 'Generate questions' }).click();
      await page.getByLabel(/what should the questions focus on/i).fill('system design');
      await page.getByRole('button', { name: 'Generate', exact: true }).click();
      await expect(page.getByText(/Tell me about a system you designed/)).toBeVisible();
      await expect(page.getByRole('checkbox')).toHaveCount(3);
      await shot(page, `${viewport.name}-2-suggestions`);

      await page
        .getByRole('checkbox', { name: /Describe a time you disagreed with a teammate/ })
        .uncheck();
      await page.getByRole('button', { name: 'Add 2 to Practice' }).click();

      await expect(page.getByRole('button', { name: '2 practice questions' })).toBeVisible();
      await expect(page.getByText(/Tell me about a system you designed/)).toBeVisible();
      await expect(page.getByText(/Describe a time you disagreed/)).toHaveCount(0);
      // The questions asked in the interview are a separate list and stay empty.
      await expect(page.getByRole('button', { name: 'No questions yet' })).toBeVisible();

      // An AI draft is reviewed, then saved with its label.
      await page.getByRole('button', { name: 'Generate answer with AI' }).first().click();
      await expect(page.getByText('AI generated draft')).toBeVisible();
      await shot(page, `${viewport.name}-3-ai-draft`);
      await page.getByRole('button', { name: 'Save answer' }).click();
      await expect(page.getByText('AI generated', { exact: true })).toBeVisible();

      // Editing the saved text keeps the label.
      await page.getByRole('button', { name: 'Edit question' }).first().click();
      await page.getByLabel(/your answer/i).fill('My own words now.');
      await page.getByRole('button', { name: 'Save', exact: true }).click();
      await expect(page.getByText('My own words now.')).toBeVisible();
      await expect(page.getByText('AI generated', { exact: true })).toBeVisible();
      await shot(page, `${viewport.name}-4-label-kept`);
    });

    test('asks for an AI key, with the API’s own message, when none is set', async ({ page }) => {
      await openInterviewsAt(page, viewport, { withAiKey: false });
      await addRoundAndOpenPractice(page);

      await page.getByRole('button', { name: 'Generate questions' }).click();
      await page.getByRole('button', { name: 'Generate', exact: true }).click();

      await expect(page.getByRole('alert')).toContainText(/AI API key/i);
    });

    test('adds a practice question by hand, with no AI label', async ({ page }) => {
      await openInterviewsAt(page, viewport, { withAiKey: false });
      await addRoundAndOpenPractice(page);

      await page.getByRole('button', { name: 'Add practice question' }).click();
      await page.getByLabel('Question', { exact: true }).fill('Why do you want this role?');
      await page.getByLabel(/your answer/i).fill('The scope, and the team.');
      await page.getByRole('button', { name: 'Save', exact: true }).click();

      await expect(page.getByText('Why do you want this role?')).toBeVisible();
      await expect(page.getByText('The scope, and the team.')).toBeVisible();
      await expect(page.getByText('AI generated', { exact: true })).toHaveCount(0);
    });
  });
}
