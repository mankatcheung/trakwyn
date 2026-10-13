import { test, expect } from '@playwright/test';
import { registerAndLogin, uniqueEmail } from './helpers/auth';
import { createApplication, openTab } from './helpers/applications';

test.describe('Application detail page', () => {
  test.beforeEach(async ({ page }) => {
    await registerAndLogin(page, { email: uniqueEmail('app-detail'), password: 'SecurePass123' });
    await createApplication(page, { company: 'Acme Corp', role: 'Staff Engineer' });
  });

  test('adds, edits, and deletes a note', async ({ page }) => {
    // Notes tab is the default active tab.
    await page.getByPlaceholder('Add a note…').fill('Recruiter said team is hiring fast.');
    await page.getByRole('button', { name: 'Add note' }).click();

    // The note goes through an optimistic insert, then a refetch once the
    // mutation settles — wait for the settled card (with its timestamp) so
    // later interactions target the final DOM node, not the optimistic one.
    const noteCard = page
      .locator('div.rounded-xl', { hasText: 'Recruiter said team is hiring fast.' })
      .filter({ hasText: /\d{1,2}\/\d{1,2}\/\d{4}/ });
    await expect(noteCard).toBeVisible();

    // Edit
    await noteCard.getByRole('button').nth(0).click();
    await page.getByRole('textbox').last().fill('Updated: onsite scheduled for next week.');
    await page.getByRole('button', { name: 'Save' }).click();
    await expect(page.getByText('Updated: onsite scheduled for next week.')).toBeVisible();

    // Delete
    const updatedCard = page
      .locator('div.rounded-xl', { hasText: 'Updated: onsite scheduled for next week.' })
      .filter({ hasText: /\d{1,2}\/\d{1,2}\/\d{4}/ });
    await updatedCard.getByRole('button').nth(1).click();
    await expect(page.getByText('Updated: onsite scheduled for next week.')).not.toBeVisible();
  });

  test('adds, edits, and deletes a contact', async ({ page }) => {
    await openTab(page, 'Contacts');

    await page.getByRole('button', { name: 'Add contact' }).click();
    await page.getByPlaceholder('Jane Smith').fill('Jane Recruiter');
    await page.getByPlaceholder('Technical Recruiter').fill('Recruiter');
    await page.getByPlaceholder('jane@company.com').fill('jane@acme.com');
    await page.getByRole('button', { name: 'Save' }).click();

    const contactCard = page
      .getByText('Jane Recruiter')
      .locator('xpath=ancestor::div[contains(@class, "rounded-xl")][1]');
    await expect(contactCard).toBeVisible();
    await expect(contactCard.getByText('Recruiter', { exact: true })).toBeVisible();

    // Edit
    await contactCard.locator('button').nth(0).click();
    await page.getByPlaceholder('Jane Smith').fill('Jane Hiring Manager');
    await page.getByRole('button', { name: 'Save' }).click();
    await expect(page.getByText('Jane Hiring Manager')).toBeVisible();

    // Delete
    const updatedCard = page
      .getByText('Jane Hiring Manager')
      .locator('xpath=ancestor::div[contains(@class, "rounded-xl")][1]');
    await updatedCard.locator('button').nth(1).click();
    await expect(page.getByText('Jane Hiring Manager')).not.toBeVisible();
  });

  test('adds an interview round and marks it passed', async ({ page }) => {
    await openTab(page, 'Interviews');

    await page.getByRole('button', { name: /add interview round/i }).click();
    await page
      .getByText('Interviewer', { exact: true })
      .locator('xpath=following-sibling::input')
      .fill('Sam from Engineering');
    await page.getByRole('button', { name: /^save$/i }).click();

    const roundCard = page
      .getByText('with Sam from Engineering')
      .locator('xpath=ancestor::div[contains(@class, "rounded-xl")][1]');
    await expect(roundCard).toBeVisible();
    await expect(roundCard.getByText('pending')).toBeVisible();

    // Edit outcome to "passed"
    await roundCard.locator('button').nth(0).click();
    await page
      .getByText('Outcome', { exact: true })
      .locator('xpath=following-sibling::select')
      .selectOption('passed');
    await page.getByRole('button', { name: /^save$/i }).click();

    await expect(
      page
        .getByText('with Sam from Engineering')
        .locator('xpath=ancestor::div[contains(@class, "rounded-xl")][1]')
        .getByText('passed'),
    ).toBeVisible();
  });

  test('uploads and deletes a document', async ({ page }) => {
    // An upload from the Resumes tab is a resume: the tab implies the type.
    await openTab(page, 'Resumes');

    await page.locator('input[type="file"]').setInputFiles({
      name: 'resume.txt',
      mimeType: 'text/plain',
      buffer: Buffer.from('Staff Engineer resume content for e2e test.'),
    });

    await expect(page.getByText('Uploaded:')).toBeVisible();
    await page.getByRole('button', { name: 'Confirm upload' }).click();

    await expect(page.getByText('resume.txt')).toBeVisible();

    // Delete lives in the row's actions menu, next to the match chip and Preview.
    const docRow = page.getByRole('listitem').filter({ hasText: 'resume.txt' });
    await docRow.getByRole('button', { name: 'More actions' }).click();
    await page.getByRole('menuitem', { name: 'Delete' }).click();
    await expect(page.getByText('resume.txt')).not.toBeVisible();
  });

  test('shows an upload in exactly one of the three document tabs', async ({ page }) => {
    await openTab(page, 'Resumes');
    await page.locator('input[type="file"]').setInputFiles({
      name: 'only-a-resume.txt',
      mimeType: 'text/plain',
      buffer: Buffer.from('Staff Engineer resume content for e2e test.'),
    });
    // No type to choose: the Resumes tab saves it as a resume.
    await expect(page.getByLabel('Document type')).toHaveCount(0);
    await page.getByRole('button', { name: 'Confirm upload' }).click();
    await expect(page.getByText('only-a-resume.txt')).toBeVisible();

    await openTab(page, 'Cover letters');
    await expect(page.getByText('No cover letters yet')).toBeVisible();
    await expect(page.getByText('only-a-resume.txt')).toHaveCount(0);

    await openTab(page, 'Other documents');
    await expect(page.getByText('No other documents yet')).toBeVisible();
    await expect(page.getByText('only-a-resume.txt')).toHaveCount(0);
  });
});
