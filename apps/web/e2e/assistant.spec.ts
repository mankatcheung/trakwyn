import { test, expect, type Page } from '@playwright/test';
import { createApplication } from './helpers/applications';
import { registerAndLogin, uniqueEmail } from './helpers/auth';

const FAKE_LLM_URL = 'http://localhost:3001/llm-test/fake/chat/completions';
const FAKE_REPLY = 'Fake assistant reply for e2e testing.';

/**
 * Points the app's existing "Custom (OpenAI-compatible)" LLM provider option
 * at FakeOAuthProvider's sibling for LLM calls — apps/api's
 * fakeLlmCompletions.routes.ts, registered only when LLM_PROVIDER_MODE=fake
 * (see ci.yml's e2e job env block). Not a new provider or a UI change: this
 * is the same real mechanism a self-hosted OpenAI-compatible endpoint uses in
 * production, just pointed at a same-origin stand-in so no live LLM call or
 * API key secret is needed in CI.
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

test.describe('AI assistant chat', () => {
  const password = 'SecurePass123';

  test.beforeEach(async ({ page }) => {
    await registerAndLogin(page, { email: uniqueEmail('assistant-test'), password });
    await setupFakeAiProvider(page);
  });

  test('sends a chat message and shows the assistant reply', async ({ page }) => {
    await page.getByRole('link', { name: 'Assistant', exact: true }).click();
    await expect(page).toHaveURL(/\/assistant$/);

    await page.getByPlaceholder('Ask a question…').fill('What applications do I have?');
    await page.getByRole('button', { name: 'Send' }).click();

    await expect(page.getByText(FAKE_REPLY)).toBeVisible();
  });

  test('a sent conversation is reachable from history', async ({ page }) => {
    await page.getByRole('link', { name: 'Assistant', exact: true }).click();
    await page.getByPlaceholder('Ask a question…').fill('Hello there');
    await page.getByRole('button', { name: 'Send' }).click();
    await expect(page.getByText(FAKE_REPLY)).toBeVisible();

    await page.getByRole('link', { name: 'Conversation history' }).click();
    await expect(page).toHaveURL(/\/assistant\/history$/);

    const conversations = page.locator('ul li a');
    await expect(conversations).toHaveCount(1);
    await conversations.first().click();

    // Back on /assistant with the same conversation restored.
    await expect(page).toHaveURL(/\/assistant\?conversation=/);
    // What's being checked is the restored *message*, so match the bubble
    // rather than any text: the same words also appear in the app-sidebar
    // subitems (JEF-229) and now in the chat header, which names the open
    // conversation — both would otherwise make this ambiguous.
    await expect(
      page.getByRole('main').getByText('Hello there', { exact: true }).last(),
    ).toBeVisible();
    await expect(page.getByText(FAKE_REPLY)).toBeVisible();
  });
});

/**
 * The chat pane is a fixed-height column: only the message list scrolls, so
 * the header (which names the open conversation) and the composer stay put.
 * jsdom has no layout engine, so these invariants can only be checked in a
 * real browser — and they're viewport-dependent, hence both sizes. The
 * desktop viewport is deliberately short so a handful of messages is enough
 * to overflow the list without a long chain of round trips.
 */
const STICKY_VIEWPORTS = [
  { name: 'desktop', width: 1280, height: 700 },
  { name: 'mobile', width: 390, height: 664 },
] as const;

for (const viewport of STICKY_VIEWPORTS) {
  test.describe(`AI assistant chat layout — ${viewport.name}`, () => {
    const password = 'SecurePass123';

    test.use({ viewport: { width: viewport.width, height: viewport.height } });

    test.beforeEach(async ({ page }) => {
      await registerAndLogin(page, { email: uniqueEmail('assistant-layout'), password });
      await setupFakeAiProvider(page);
    });

    test('keeps the header and composer in view while the message list scrolls', async ({
      page,
    }) => {
      await page.goto('/assistant');

      const composer = page.getByPlaceholder('Ask a question…');
      const heading = page.getByRole('heading', { name: 'Assistant' });

      // Enough turns to overflow the list at either viewport height.
      for (let i = 1; i <= 6; i++) {
        await composer.fill(`Question number ${i}`);
        await page.getByRole('button', { name: 'Send' }).click();
        await expect(page.getByText(FAKE_REPLY)).toHaveCount(i);
      }

      // The whole page must not scroll — that's what pushed the composer off
      // screen before. Only an inner region may overflow.
      const pageScrolls = await page.evaluate(() => {
        const el = document.documentElement;
        return el.scrollHeight > el.clientHeight + 1;
      });
      expect(pageScrolls).toBe(false);

      const mainScrolls = await page.evaluate(() => {
        const el = document.querySelector('main')!;
        return el.scrollHeight > el.clientHeight + 1;
      });
      expect(mainScrolls).toBe(false);

      await expect(heading).toBeInViewport();
      await expect(composer).toBeInViewport();

      const headingBefore = await heading.boundingBox();
      const composerBefore = await composer.boundingBox();

      // Scroll the message list itself to the very top.
      const scrolled = await page.evaluate(() => {
        const region = [...document.querySelectorAll('div')].find(
          (el) =>
            getComputedStyle(el).overflowY === 'auto' && el.scrollHeight > el.clientHeight + 1,
        );
        if (!region) return false;
        region.scrollTop = 0;
        return true;
      });
      expect(scrolled).toBe(true);

      // Both chrome elements are exactly where they were — that is the
      // stickiness, and it's what a scrolling page would have broken.
      expect(await heading.boundingBox()).toEqual(headingBefore);
      expect(await composer.boundingBox()).toEqual(composerBefore);
      await expect(heading).toBeInViewport();
      await expect(composer).toBeInViewport();
    });

    test('names the open conversation in the pinned header', async ({ page }) => {
      await page.goto('/assistant');

      await page.getByPlaceholder('Ask a question…').fill('Prep me for a Stripe interview');
      await page.getByRole('button', { name: 'Send' }).click();
      await expect(page.getByText(FAKE_REPLY)).toBeVisible();

      // The title is derived server-side from the first message.
      const header = page.getByRole('main').getByText('Prep me for a Stripe interview').first();
      await expect(header).toBeVisible();
      await expect(header).toBeInViewport();
    });
  });
}

test.describe('AI resume generation', () => {
  const password = 'SecurePass123';

  test.beforeEach(async ({ page }) => {
    await registerAndLogin(page, { email: uniqueEmail('resume-gen-test'), password });
    await setupFakeAiProvider(page);

    // Matches fakeLlmCompletions.routes.ts's canned resume exactly —
    // GenerateResumeUseCase refuses to save a resume naming an employer or
    // institution the user hasn't actually recorded. "Add" is both the
    // section header's open-the-form trigger and, once open, the form's own
    // submit button — scope the submit click to <form> to disambiguate.
    await page.goto('/settings/experience');
    const workSection = page.locator('section').filter({ hasText: 'Work Experience' });
    await workSection.getByRole('button', { name: 'Add' }).click();
    await page.getByPlaceholder('Acme Corp').fill('Acme Corp');
    await page.getByPlaceholder('Software Engineer').fill('Senior Engineer');
    await workSection.locator('input[type="date"]').first().fill('2020-01-01');
    await workSection.locator('form').getByRole('button', { name: 'Add' }).click();
    await expect(workSection.locator('form')).toHaveCount(0);

    const eduSection = page.locator('section').filter({ hasText: 'Education' });
    await eduSection.getByRole('button', { name: 'Add' }).click();
    await page.getByPlaceholder('MIT').fill('State University');
    await eduSection.locator('input[type="date"]').first().fill('2016-01-01');
    await eduSection.locator('form').getByRole('button', { name: 'Add' }).click();
    await expect(eduSection.locator('form')).toHaveCount(0);
  });

  test('generates a tailored resume and saves it as a reachable document draft', async ({
    page,
  }) => {
    const applicationId = await createApplication(page, { company: 'DestCo', role: 'Engineer' });

    // The resume form is its own page, so there is no type to pick (JEF-396).
    await page.goto(`/applications/${applicationId}/resumes/new`);
    await page.getByRole('button', { name: /generate resume/i }).click();

    // (?!new$) excludes the form's own URL — it already matches
    // ".../documents/<segment>$" before the post-generate navigation happens,
    // the same trap createApplication's helper had (see its own fix).
    await expect(page).toHaveURL(
      new RegExp(`/applications/${applicationId}/documents/(?!new$)[^/]+$`),
    );
    await expect(page.getByText('Acme Corp')).toBeVisible();
    await expect(page.getByText('Built things.')).toBeVisible();

    // Reachable again from the application's own Resumes tab, not just the
    // page this navigation happened to land on.
    await page.goto(`/applications/${applicationId}`);
    await page
      .getByRole('navigation', { name: 'Section navigation' })
      .getByRole('button', { name: 'Resumes' })
      .click();
    await expect(page.getByRole('link', { name: /DestCo — Engineer/ })).toBeVisible();
  });

  test('generates a cover letter from its own create form and lists it under Cover letters', async ({
    page,
  }) => {
    const applicationId = await createApplication(page, { company: 'LetterCo', role: 'Engineer' });

    // Same flow as the resume: the generate block lives on the create form.
    await page.goto(`/applications/${applicationId}/cover-letters/new`);
    await expect(page.getByLabel(/base it on a resume/i)).toBeVisible();
    await page.getByRole('button', { name: /generate cover letter/i }).click();

    await expect(page).toHaveURL(
      new RegExp(`/applications/${applicationId}/documents/(?!new$)[^/]+$`),
    );

    await page.goto(`/applications/${applicationId}`);
    await page
      .getByRole('navigation', { name: 'Section navigation' })
      .getByRole('button', { name: 'Cover letters' })
      .click();
    await expect(page.getByRole('link', { name: /LetterCo — Engineer/ })).toBeVisible();
    // The old in-tab generator is gone: generation happens on the create form only.
    await expect(page.getByRole('button', { name: /generate cover letter/i })).toHaveCount(0);
  });
});
