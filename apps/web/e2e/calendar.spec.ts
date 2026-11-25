import { test, expect } from '@playwright/test';
import { registerAndLogin, uniqueEmail } from './helpers/auth';
import { createApplication, openTab } from './helpers/applications';

function todayDateTimeLocal(hour: number): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}T${String(hour).padStart(2, '0')}:00`;
}

test.describe('Calendar', () => {
  test.beforeEach(async ({ page }) => {
    await registerAndLogin(page, { email: uniqueEmail('calendar'), password: 'SecurePass123' });
  });

  test('shows an interview round scheduled for today on the calendar', async ({ page }) => {
    await createApplication(page, { company: 'Acme Corp', role: 'Staff Engineer' });
    await openTab(page, 'Interviews');

    await page.getByRole('button', { name: /add interview round/i }).click();
    const scheduledAtInput = page
      .getByText('Scheduled at', { exact: true })
      .locator('xpath=following-sibling::input');
    await scheduledAtInput.fill(todayDateTimeLocal(14));
    await expect(scheduledAtInput).toHaveValue(todayDateTimeLocal(14));

    // The round card appears optimistically before the create mutation has
    // actually settled server-side — wait for the real response, or the
    // calendar's own fetch (fired by clicking below) can race ahead of it
    // and load before the round is actually persisted.
    const createResponse = page.waitForResponse(
      (res) =>
        res.url().includes('/graphql') &&
        (res.request().postData() ?? '').includes('CreateInterviewRound'),
    );
    await page.getByRole('button', { name: /^save$/i }).click();
    await createResponse;

    await expect(page.getByText(/2:00 PM/)).toBeVisible();

    await page.getByRole('link', { name: 'Calendar' }).click();
    await expect(page.getByText('Sun')).toBeVisible();

    // Day view shows today's events immediately, avoiding any ambiguity
    // from clicking a specific day-of-month cell in the month grid.
    await page.getByRole('button', { name: 'Day', exact: true }).click();

    await expect(page.getByText(/Interview \(phone\) — Acme Corp/)).toBeVisible();
    await expect(page.getByText('Staff Engineer')).toBeVisible();

    // Clicking through the event navigates to the application detail page.
    await page.getByText(/Interview \(phone\) — Acme Corp/).click();
    await expect(page).toHaveURL(/\/applications\/[^/]+$/);
  });

  test('shows a placeholder when there are no events on the selected day', async ({ page }) => {
    // Client-side navigation — see the comment in helpers/applications.ts on
    // why a full page.goto to a loader-backed authenticated route can race
    // session rehydration.
    await page.getByRole('link', { name: 'Calendar' }).click();
    await expect(page.getByText('Sun')).toBeVisible();
    await expect(page.getByText('Select a day to see its events.')).toBeVisible();
  });
});
