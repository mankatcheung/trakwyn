// Renders og/og-image.svg to public/og-image.png (JEF-462), with the
// Chromium Playwright already installs for the e2e tests. Run from apps/web:
// `node og/render.mjs`. The PNG is committed; this only runs when the card
// changes.
import { readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { chromium } from '@playwright/test';

const WIDTH = 1200;
const HEIGHT = 630;
// WhatsApp silently drops a preview image much above this.
const MAX_BYTES = 300 * 1024;

const root = join(import.meta.dirname, '..');
const svg = readFileSync(join(root, 'og', 'og-image.svg'), 'utf8');
const out = join(root, 'public', 'og-image.png');

const browser = await chromium.launch();
try {
  const page = await browser.newPage({ viewport: { width: WIDTH, height: HEIGHT } });
  await page.setContent(`<html><body style="margin:0">${svg}</body></html>`);
  await page.screenshot({ path: out, clip: { x: 0, y: 0, width: WIDTH, height: HEIGHT } });
} finally {
  await browser.close();
}

const bytes = statSync(out).size;
if (bytes > MAX_BYTES) {
  throw new Error(`og-image.png is ${bytes} bytes; keep it under ${MAX_BYTES}`);
}
console.log(`Wrote ${out} (${bytes} bytes)`);
