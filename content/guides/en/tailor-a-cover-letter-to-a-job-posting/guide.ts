import { expect, shot, signInAsDemo, t, test } from '../../../../apps/web/e2e/guides/helpers';

// The steps of index.md. Each shot() is the ./<name>.webp that step shows.
test('Tailor a cover letter to a job posting', async ({ page }) => {
  await signInAsDemo(page);

  // 1. Put the job description on the application
  await page.goto('/applications/board');
  await page.getByText('TechCorp').first().click();
  await expect(page).toHaveURL(/\/applications\/[^/]+$/);
  await expect(
    page
      .getByText(t('applicationDetail.descriptionLabel'), { exact: true })
      .filter({ visible: true }),
  ).toBeVisible();
  await shot(page, 'job-description');

  // 2. Create a cover letter
  const sections = page.getByRole('navigation', { name: 'Section navigation' });
  await sections.getByRole('button', { name: /^cover letters/i }).click();
  await expect(page.getByText(t('documents.emptyCoverLetters'))).toBeVisible();
  await shot(page, 'cover-letters');
  await page.getByRole('button', { name: t('documents.createNew') }).click();

  // 3. Ask the AI helper for a first draft
  await expect(page).toHaveURL(/\/documents\//);
  await expect(page.getByRole('heading', { name: t('aiHelper.title') })).toBeVisible();
  await expect(page.getByText(t('documentDraft.baseOnResumeLabel'))).toBeVisible();
  await shot(page, 'ai-helper');

  // 5. Export it
  await expect(page.getByRole('button', { name: t('documentDraftEdit.exportPdf') })).toBeVisible();
});
