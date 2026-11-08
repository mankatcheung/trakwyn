import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, test, type BrowserContext, type Page } from '@playwright/test';
import sharp from 'sharp';
import {
  SCREENSHOT_SCALE,
  SCREENSHOT_SCREENS,
  SCREENSHOT_THEMES,
  screenshotFile,
  type ScreenshotName,
  type ScreenshotTheme,
} from '../src/lib/screenshots';

// Real screenshots from the seeded demo account (JEF-528). Run with
// `pnpm --filter @trakwyn/web screenshots`; see apps/web/CLAUDE.md.
// Kept in step with apps/api/src/seed/index.ts, which the web app cannot import.
const DEMO_EMAIL = 'demo@trakwyn.app';
const DEMO_PASSWORD = 'demo1234';
const API_URL = 'http://localhost:3001/graphql';
const THEME_STORAGE_KEY = 'theme';
const COOKIE_CONSENT_KEY = 'trakwyn_cookie_consent';
/** An interviewing application in the seed with notes and a tailored resume. */
const DETAIL_COMPANY = 'TechCorp';

const OUT_DIR = join(import.meta.dirname, '..', 'public', 'screenshots');
const WEBP_QUALITY = 80;

/**
 * The TanStack devtools in the dev server: the floating toggle button
 * (`aria-label="Open TanStack Devtools"`) and its panel (`#tanstack_devtools`,
 * with an underscore). `settle` fails if any of them is still visible.
 */
const DEVTOOLS_SELECTOR = [
  'button[aria-label="Open TanStack Devtools"]',
  '#tanstack_devtools',
  '[id^="plugin-container-tanstack"]',
  '.TanStackRouterDevtoolsPanel',
  '.tsqd-parent-container',
].join(', ');

const HIDE_NOISE_CSS = `
  [data-sonner-toaster], ${DEVTOOLS_SELECTOR} { display: none !important; }
  *, *::before, *::after { animation: none !important; transition: none !important; caret-color: transparent !important; }
`;

async function assertDemoAccount(page: Page): Promise<void> {
  const email = await page.evaluate(async () => {
    const res = await fetch('/graphql', {
      method: 'POST',
      credentials: 'include',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ query: '{ me { email } }' }),
    });
    const body = (await res.json()) as { data?: { me?: { email?: string } } };
    return body.data?.me?.email ?? null;
  });
  if (email !== DEMO_EMAIL) {
    throw new Error(
      `Refusing to capture: signed in as ${email ?? 'nobody'}, not ${DEMO_EMAIL}. ` +
        'Screenshots must only ever show the seeded demo account.',
    );
  }
}

async function signIn(page: Page): Promise<void> {
  await page.goto('/login');
  await page.getByPlaceholder('you@example.com').fill(DEMO_EMAIL);
  await page.getByPlaceholder('••••••••').fill(DEMO_PASSWORD);
  await page.getByRole('button', { name: /^(sign in|log in)$/i }).click();
  await page.waitForURL(/\/dashboard/);
  await assertDemoAccount(page);
}

async function settle(page: Page): Promise<void> {
  await page.addStyleTag({ content: HIDE_NOISE_CSS });
  await page.evaluate(() => document.fonts.ready);
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(400);
  // The devtools mount after hydration; never photograph them.
  await expect(page.locator(DEVTOOLS_SELECTOR).locator('visible=true')).toHaveCount(0);
}

async function open(page: Page, name: ScreenshotName): Promise<void> {
  switch (name) {
    case 'board':
      await page.goto('/applications/board');
      // The first page load on a cold dev server compiles routes: allow for it.
      await expect(page.getByText(DETAIL_COMPANY).first()).toBeVisible({ timeout: 30_000 });
      break;
    case 'application-detail':
      await page.goto('/applications/board');
      await page.getByText(DETAIL_COMPANY).first().click();
      await expect(page).toHaveURL(/\/applications\/[^/]+$/);
      await page
        .getByRole('navigation', { name: 'Section navigation' })
        .getByRole('button', { name: /^notes/i })
        .click();
      break;
    case 'assistant':
      await page.goto('/assistant');
      await expect(page.getByRole('textbox').first()).toBeVisible();
      break;
    case 'resume':
      await page.goto('/applications/board');
      await page.getByText(DETAIL_COMPANY).first().click();
      await page
        .getByRole('navigation', { name: 'Section navigation' })
        .getByRole('button', { name: /^resumes/i })
        .click();
      await page
        .getByRole('link', { name: /resume/i })
        .first()
        .click();
      await expect(page).toHaveURL(/\/documents\//);
      break;
    case 'analytics':
      await page.goto('/analytics');
      await expect(page.getByRole('heading', { name: 'Analytics' })).toBeVisible();
      // The locked preview means plans are enforced; refuse to photograph it.
      await expect(page.getByText(/available on pro/i)).toHaveCount(0);
      await expect(page.getByText('Stage funnel')).toBeVisible();
      break;
  }
}

async function newThemedContext(
  browser: import('@playwright/test').Browser,
  theme: ScreenshotTheme,
  viewport: { width: number; height: number },
): Promise<BrowserContext> {
  const context = await browser.newContext({
    viewport,
    deviceScaleFactor: SCREENSHOT_SCALE,
    colorScheme: theme,
    reducedMotion: 'reduce',
  });
  await context.addInitScript(
    ([themeKey, theme, consentKey]) => {
      localStorage.setItem(themeKey, theme);
      // Any stored choice hides the cookie banner; analytics stay off.
      if (!localStorage.getItem(consentKey)) {
        localStorage.setItem(
          consentKey,
          JSON.stringify({ analytics: false, consentedAt: '2026-01-01T00:00:00.000Z' }),
        );
      }
    },
    [THEME_STORAGE_KEY, theme, COOKIE_CONSENT_KEY] as const,
  );
  return context;
}

test.describe('marketing screenshots', () => {
  test.beforeAll(async () => {
    let reachable = false;
    try {
      const res = await fetch(API_URL, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ query: '{ __typename }' }),
      });
      reachable = res.ok;
    } catch {
      reachable = false;
    }
    if (!reachable) {
      throw new Error(`The API is not reachable at ${API_URL}. Start it, or stop a stale server.`);
    }
    mkdirSync(OUT_DIR, { recursive: true });
  });

  for (const screen of SCREENSHOT_SCREENS) {
    for (const theme of SCREENSHOT_THEMES) {
      test(`${screen.name} (${theme})`, async ({ browser }) => {
        const context = await newThemedContext(browser, theme, screen.viewport);
        const tmp = mkdtempSync(join(tmpdir(), 'trakwyn-shot-'));
        try {
          const page = await context.newPage();
          await signIn(page);
          await open(page, screen.name);
          await settle(page);
          expect(
            await page.evaluate(() => document.documentElement.classList.contains('dark')),
          ).toBe(theme === 'dark');
          const png = join(tmp, 'shot.png');
          await page.screenshot({ path: png });
          await sharp(png)
            .webp({ quality: WEBP_QUALITY, effort: 6 })
            .toFile(join(OUT_DIR, screenshotFile(screen.name, theme)));
        } finally {
          rmSync(tmp, { recursive: true, force: true });
          await context.close();
        }
      });
    }
  }
});
