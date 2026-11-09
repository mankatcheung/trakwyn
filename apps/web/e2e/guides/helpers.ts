import { mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';
import { expect, test, type Locator, type Page } from '@playwright/test';
import sharp from 'sharp';
import { imageNamesIn } from '../../../../content/src/index';
import { differsVisibly, type RawImage } from './imageDiff';

// Helpers for the guide scripts (JEF-532): content/guides/en/<slug>/guide.ts.
// A script signs in as the seeded demo account, walks the guide's steps and
// calls `shot(page, '<name>')` where the Markdown shows `./<name>.webp`.
// See "Writing a guide script" in content/README.md.
export { expect, test };

const EN: Record<string, string> = JSON.parse(
  readFileSync(join(import.meta.dirname, '../../src/i18n/en.json'), 'utf8'),
);

/**
 * The English text of an i18n key. Guides find elements by this text, so a
 * button that is renamed or removed fails verify instead of misleading readers.
 */
export function t(key: string): string {
  const text = EN[key];
  if (text === undefined) throw new Error(`No English text for i18n key '${key}'`);
  return text;
}

/**
 * The input or textarea under a form label. Some forms do not tie their labels
 * to inputs, so `getByLabel` cannot find them; this goes by the label's text.
 */
export function field(page: Page, label: string): Locator {
  return page
    .getByText(label, { exact: true })
    .locator('xpath=..')
    .locator('input, textarea')
    .first();
}

export type GuideMode = 'capture' | 'verify';

/** `capture` writes images that changed; `verify` only checks the steps run. */
export const guideMode: GuideMode = process.env.GUIDES_MODE === 'capture' ? 'capture' : 'verify';

/** Kept in step with apps/api/src/seed/index.ts, which the web app cannot import. */
export const DEMO_EMAIL = 'demo@trakwyn.app';
const DEMO_PASSWORD = 'demo1234';
const COOKIE_CONSENT_KEY = 'trakwyn_cookie_consent';

/** Every image is 1600 × 1000 (16:10) WebP, as GuideMarkdown reserves (JEF-531). */
export const IMAGE_WIDTH = 1600;
export const IMAGE_HEIGHT = 1000;
const WEBP_QUALITY = 80;
const MAX_IMAGE_BYTES = 300 * 1024;

/** The seed and the page share this instant, so relative dates read the same every run. */
function fixedNow(): string {
  const now = process.env.GUIDES_NOW;
  if (!now) throw new Error('GUIDES_NOW is not set: run the guides through `pnpm guides:verify`.');
  return now;
}

/** Hides the toaster and the dev-server devtools, and stops animation and the caret. */
const QUIET_CSS = `
  [data-sonner-toaster],
  button[aria-label="Open TanStack Devtools"],
  #tanstack_devtools,
  [id^="plugin-container-tanstack"],
  .TanStackRouterDevtoolsPanel,
  .tsqd-parent-container { display: none !important; }
  *, *::before, *::after {
    animation: none !important;
    transition: none !important;
    caret-color: transparent !important;
    scroll-behavior: auto !important;
  }
`;

/**
 * Makes a page render the same on every run: the viewport the images are
 * sized for, a frozen clock, no motion, and the cookie banner dismissed. Call
 * it before the first navigation.
 */
export async function prepare(page: Page): Promise<void> {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.clock.setFixedTime(fixedNow());
  await page.emulateMedia({ reducedMotion: 'reduce', colorScheme: 'light' });
  await page.addInitScript((key) => {
    // Any stored choice hides the banner; analytics stay off.
    localStorage.setItem(
      key,
      JSON.stringify({ analytics: false, consentedAt: '2026-01-01T00:00:00.000Z' }),
    );
    localStorage.setItem('theme', 'light');
  }, COOKIE_CONSENT_KEY);
}

async function signedInEmail(page: Page): Promise<string | null> {
  return page.evaluate(async () => {
    const res = await fetch('/graphql', {
      method: 'POST',
      credentials: 'include',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ query: '{ me { email } }' }),
    });
    const body = (await res.json()) as { data?: { me?: { email?: string } } };
    return body.data?.me?.email ?? null;
  });
}

/**
 * Signs in as the seeded demo account and refuses to continue as anyone else,
 * so a guide never shows a real or random e2e user.
 */
export async function signInAsDemo(page: Page): Promise<void> {
  await prepare(page);
  await page.goto('/login');
  await page.getByPlaceholder('you@example.com').fill(DEMO_EMAIL);
  await page.getByPlaceholder('••••••••').fill(DEMO_PASSWORD);
  await page.getByRole('button', { name: /^(sign in|log in)$/i }).click();
  await page.waitForURL(/\/dashboard/);
  const email = await signedInEmail(page);
  if (email !== DEMO_EMAIL) {
    throw new Error(
      `Signed in as ${email ?? 'nobody'}, not ${DEMO_EMAIL}. Run the guides through ` +
        '`pnpm guides:verify`, which seeds the demo account first.',
    );
  }
}

export interface ShotOptions {
  /** Centre the image on this element instead of the top of the page. */
  locator?: Locator;
  /** Painted over before the image is taken, for anything that varies run to run. */
  mask?: Locator[];
}

function guideDir(): string {
  return dirname(test.info().file);
}

async function toRaw(input: Buffer | string, resize: boolean): Promise<RawImage> {
  let image = sharp(input);
  if (resize) image = image.resize(IMAGE_WIDTH, IMAGE_HEIGHT, { fit: 'fill' });
  const { data, info } = await image.ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  return { data, width: info.width, height: info.height };
}

async function readExisting(file: string): Promise<RawImage | null> {
  try {
    statSync(file);
  } catch {
    return null;
  }
  return toRaw(file, false);
}

/** A 16:10 box around `box`, kept inside the page. */
function clipAround(box: { x: number; y: number; width: number; height: number }, page: Page) {
  const viewport = page.viewportSize() ?? { width: 1280, height: 800 };
  const width = Math.min(viewport.width, Math.max(box.width, (box.height * 16) / 10));
  const height = (width * 10) / 16;
  const x = Math.min(Math.max(box.x + box.width / 2 - width / 2, 0), viewport.width - width);
  const y = Math.max(box.y + box.height / 2 - height / 2, 0);
  return { x, y, width, height };
}

/**
 * Takes the guide's screenshot called `name`, which index.md shows as
 * `./<name>.webp`. In verify mode it only checks that name is in index.md. In
 * capture mode it writes the WebP, but only when it differs visibly from the
 * one on disk, so a rerun with no UI change leaves git clean.
 */
export async function shot(page: Page, name: string, options: ShotOptions = {}): Promise<void> {
  const dir = guideDir();
  const shown = imageNamesIn(readFileSync(join(dir, 'index.md'), 'utf8'));
  if (!shown.includes(name)) {
    throw new Error(`${basename(dir)}: shot '${name}' is not shown in index.md as ./${name}.webp`);
  }
  if (guideMode === 'verify') return;

  await page.addStyleTag({ content: QUIET_CSS });
  await page.evaluate(() => document.fonts.ready);
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(400);
  const box = options.locator ? await options.locator.boundingBox() : null;
  const png = await page.screenshot({
    mask: options.mask,
    clip: box ? clipAround(box, page) : undefined,
  });

  const file = join(dir, `${name}.webp`);
  if (!differsVisibly(await readExisting(file), await toRaw(png, true))) return;

  const webp = await sharp(png)
    .resize(IMAGE_WIDTH, IMAGE_HEIGHT, { fit: 'fill' })
    .webp({ quality: WEBP_QUALITY, effort: 6 })
    .toBuffer();
  if (webp.length > MAX_IMAGE_BYTES) {
    throw new Error(
      `${name}.webp is ${webp.length} bytes, over the ${MAX_IMAGE_BYTES} byte budget`,
    );
  }
  mkdirSync(dir, { recursive: true });
  writeFileSync(file, webp);
}
