import { test, expect } from '@playwright/test';
import { registerAndLogin, uniqueEmail } from './helpers/auth';
import { createApplication, openTab } from './helpers/applications';

// Short and missing a Skills section, so the check has something to report.
const RESUME = [
  'Jane Doe',
  'jane.doe@example.com',
  '+1 415 555 0134',
  'Work Experience',
  'Engineer, Acme — Jan 2021 – Present',
  '- Cut page load time by 40%',
  '- Led a team of 6 engineers',
  '- Shipped 12 releases',
  'Education',
  'BSc, State University — 2013 – 2017',
].join('\n');

const shot = async (page: import('@playwright/test').Page, name: string) => {
  const dir = process.env.E2E_SHOT_DIR;
  if (dir) await page.screenshot({ path: `${dir}/${name}.png`, fullPage: true });
};

test.describe('Resume ATS check', () => {
  test.use({ viewport: { width: 1440, height: 900 } });

  test.beforeEach(async ({ page }) => {
    await registerAndLogin(page, { email: uniqueEmail('resume-ats'), password: 'SecurePass123' });
    await createApplication(page, { company: 'Acme Corp', role: 'Staff Engineer' });
  });

  test('checks an uploaded resume and lists what to fix', async ({ page }) => {
    await openTab(page, 'Resumes');
    await page.locator('input[type="file"]').setInputFiles({
      name: 'jane-resume.txt',
      mimeType: 'text/plain',
      buffer: Buffer.from(RESUME),
    });
    await page.getByRole('button', { name: 'Confirm upload' }).click();
    const row = page.getByRole('listitem').filter({ hasText: 'jane-resume.txt' });
    await expect(row).toBeVisible();

    await row.getByRole('button', { name: 'Check ATS' }).click();

    await expect(row.getByText('Skills heading')).toBeVisible();
    await expect(row.getByText(/Fix these first · \d/)).toBeVisible();
    await expect(row.getByText(/Add a heading named “Skills”/)).toBeVisible();
    // Separate from the job match, which stays its own chip.
    await expect(row.getByRole('button', { name: 'Generate match' })).toBeVisible();

    await shot(page, 'desktop-1440');
    await page.setViewportSize({ width: 390, height: 844 });
    await expect(row.getByText('Skills heading')).toBeVisible();
    await shot(page, 'mobile-390');
  });
});
