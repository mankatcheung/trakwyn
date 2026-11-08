import {
  expect,
  field,
  shot,
  signInAsDemo,
  t,
  test,
} from '../../../../apps/web/e2e/guides/helpers';

// The steps of index.md. Each shot() is the ./<name>.webp that step shows.
test('Track your first job application', async ({ page }) => {
  await signInAsDemo(page);

  // 1. Open your applications
  await page.getByRole('link', { name: t('nav.applications'), exact: true }).click();
  await expect(page.getByRole('heading', { name: t('applications.title') })).toBeVisible();
  await expect(page.getByText('TechCorp').first()).toBeVisible();
  await shot(page, 'applications-list');

  // 2. Fill in the basics
  await page.getByRole('link', { name: t('applications.newApplicationAria') }).click();
  await expect(page.getByRole('heading', { name: t('applicationForm.newTitle') })).toBeVisible();
  await field(page, t('applicationForm.companyLabel')).fill('Northwind Labs');
  await field(page, t('applicationForm.roleLabel')).fill('Frontend Engineer');
  await field(page, t('applicationForm.jobUrlLabel')).fill(
    'https://northwind.example.com/jobs/frontend',
  );
  await field(page, t('applicationForm.locationLabel')).fill('Remote');
  await field(page, t('applicationForm.salaryRangeLabel')).fill('$110k–$140k');
  await shot(page, 'new-application');

  // 3. Move it across the board
  await page.goto('/applications/board');
  await expect(page.getByText('TechCorp').first()).toBeVisible();
  await shot(page, 'board');

  // 4. Keep everything for one role together
  await page.getByText('TechCorp').first().click();
  await expect(page).toHaveURL(/\/applications\/[^/]+$/);
  const sections = page.getByRole('navigation', { name: 'Section navigation' });
  for (const section of ['Overview', 'Notes', 'Interviews', 'Contacts', 'Activity']) {
    await expect(sections.getByRole('button', { name: new RegExp(`^${section}`) })).toBeVisible();
  }
  await shot(page, 'application-detail');
});
