import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * The installed web app's colours (JEF-691). `public/manifest.webmanifest`
 * sets the status bar and splash screen of an installed app, and it can hold
 * only one value, so it carries the light page colour. Three files must agree
 * on it, and nothing but this test notices when one of them moves:
 *
 *   - `routes/__root.tsx`: the two `theme-color` meta tags, one per scheme;
 *   - `styles.css`: the page background the browser paints under the app;
 *   - the manifest's `theme_color` and `background_color`.
 */
const WEB_ROOT = join(import.meta.dirname, '..', '..', '..');
const read = (path: string): string => readFileSync(join(WEB_ROOT, path), 'utf8');

const HEX = '(#[0-9a-fA-F]{6})';

function themeColorMeta(scheme: 'light' | 'dark'): string {
  const pattern = new RegExp(
    `name: 'theme-color', content: '${HEX}', media: '\\(prefers-color-scheme: ${scheme}\\)'`,
  );
  const match = read('src/routes/__root.tsx').match(pattern);
  if (!match) throw new Error(`no ${scheme} theme-color meta tag found in routes/__root.tsx`);
  return match[1].toLowerCase();
}

function pageBackground(scheme: 'light' | 'dark'): string {
  const selector = scheme === 'light' ? '^body' : '^\\.dark body';
  const pattern = new RegExp(`${selector}\\s*\\{[^}]*?background-color:\\s*${HEX}`, 'm');
  const match = read('src/styles.css').match(pattern);
  if (!match) throw new Error(`no ${scheme} body background found in styles.css`);
  return match[1].toLowerCase();
}

describe('installed web app colours (JEF-691)', () => {
  const manifest = JSON.parse(read('public/manifest.webmanifest')) as {
    theme_color: string;
    background_color: string;
  };

  it('uses the light theme-color meta tag as the manifest theme colour', () => {
    expect(manifest.theme_color.toLowerCase()).toBe(themeColorMeta('light'));
  });

  it('uses the light page background as the splash background', () => {
    expect(manifest.background_color.toLowerCase()).toBe(pageBackground('light'));
  });

  it('keeps each theme-color meta tag equal to its page background, so the browser bar blends in', () => {
    expect(themeColorMeta('light')).toBe(pageBackground('light'));
    expect(themeColorMeta('dark')).toBe(pageBackground('dark'));
  });
});
