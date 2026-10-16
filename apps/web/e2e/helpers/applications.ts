import type { Page } from '@playwright/test';
import { expect } from '@playwright/test';

/**
 * Creates a new application via the UI and lands on its detail page.
 * Returns the new application's id, parsed from the resulting URL.
 */
export async function createApplication(
  page: Page,
  { company, role }: { company: string; role: string },
): Promise<string> {
  // Client-side navigation, not page.goto: /applications has a route loader
  // that fires a query on load, and a full page reload can race the loader
  // against session rehydration, occasionally 401ing into the error boundary.
  await page.getByRole('link', { name: 'Applications', exact: true }).click();
  await page.getByRole('link', { name: /new application/i }).click();
  await page.getByPlaceholder('Acme Corp').fill(company);
  await page.getByPlaceholder('Senior Engineer').fill(role);
  await page.getByRole('button', { name: /save application/i }).click();

  // (?!new$) excludes the form's own URL (/applications/new) — without it,
  // this can match before the post-save navigation actually happens (the
  // form page's own URL already satisfies "/applications/<segment>$"), so a
  // caller that uses the returned id gets the literal string "new" instead
  // of racing correctly. Harmless for callers that only navigate via UI
  // clicks afterward, but wrong for any caller that uses the id directly.
  const detailUrlPattern = /\/applications\/(?!new$)[^/]+$/;
  await expect(page).toHaveURL(detailUrlPattern);
  const match = /\/applications\/([^/]+)$/.exec(page.url());
  if (!match) throw new Error(`Could not parse applicationId from URL: ${page.url()}`);
  return match[1];
}

/**
 * Opens the "More actions" menu on the application detail page and chooses
 * one of its items (Star, Edit, Change status, Delete application).
 *
 * Playwright's default viewport is wide, where the actions are a popover of
 * `menuitem`s (JEF-404); a phone-width test gets the bottom sheet's buttons
 * instead and should not use this helper.
 */
export async function chooseApplicationAction(page: Page, name: string): Promise<void> {
  await page.getByRole('button', { name: 'More actions' }).click();
  await page.getByRole('menuitem', { name }).click();
}

/** Clicks a section-navigation tab on the application detail page (desktop sidebar). */
export async function openTab(page: Page, label: string): Promise<void> {
  await page
    .getByRole('navigation', { name: 'Section navigation' })
    .getByRole('button', { name: label })
    .click();
}
