import { test, expect, type Page } from '@playwright/test';

/**
 * Phone, tablet and desktop checks for the public marketing pages (JEF-681).
 *
 * `a11y.spec.ts` runs axe on the same pages; this file covers what axe cannot
 * see: a page wider than its viewport, an image with no description, a control
 * too small to tap, and whether the keyboard can reach and see the header.
 */

const PAGES = [
  '/',
  '/features',
  '/features/tracking',
  '/features/ai-assistant',
  '/features/resume-cover-letter',
  '/features/analytics',
  '/pricing',
  '/ai-mcp-setup',
  '/guides',
] as const;

const VIEWPORTS = [
  { name: 'phone', width: 390, height: 844 },
  { name: 'tablet', width: 768, height: 1024 },
  { name: 'desktop', width: 1440, height: 900 },
] as const;

/** The smallest tap target WCAG 2.5.5 (AAA) and Apple's guidelines ask for. */
const MIN_TAP_PX = 44;

async function open(page: Page, path: string, colorScheme: 'light' | 'dark' = 'light') {
  await page.emulateMedia({ reducedMotion: 'reduce', colorScheme });
  await page.goto(path);
  await expect(page.getByRole('heading', { level: 1 }).first()).toBeVisible();
}

test.describe('Marketing pages – no horizontal scroll (JEF-681)', () => {
  for (const viewport of VIEWPORTS) {
    for (const colorScheme of ['light', 'dark'] as const) {
      for (const path of PAGES) {
        test(`${path} fits ${viewport.name} (${viewport.width}px) in ${colorScheme}`, async ({
          page,
        }) => {
          await page.setViewportSize({ width: viewport.width, height: viewport.height });
          await open(page, path, colorScheme);
          // Let the lazy images that are in range settle: a late one can widen the page.
          await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
          await page.waitForTimeout(200);
          const overflow = await page.evaluate(() => {
            const root = document.documentElement;
            const wide = [...document.body.querySelectorAll('*')]
              .filter((el) => el.getBoundingClientRect().right > root.clientWidth + 1)
              .slice(0, 5)
              .map((el) => `${el.tagName.toLowerCase()}.${String(el.className).slice(0, 60)}`);
            return { scrollWidth: root.scrollWidth, clientWidth: root.clientWidth, wide };
          });
          expect(overflow.scrollWidth, `wider than the viewport: ${overflow.wide.join(', ')}`).toBe(
            overflow.clientWidth,
          );
        });
      }
    }
  }
});

test.describe('Marketing pages – images (JEF-681)', () => {
  for (const path of PAGES) {
    test(`${path}: every image has alt text and loads`, async ({ page }) => {
      await open(page, path);
      await page.evaluate(async () => {
        // Lazy images only load near the viewport: walk the page so each one does.
        for (let y = 0; y < document.body.scrollHeight; y += 600) {
          window.scrollTo(0, y);
          await new Promise((resolve) => setTimeout(resolve, 50));
        }
      });
      const images = await page.evaluate(() =>
        [...document.images]
          // A `dark:hidden` / `hidden dark:block` pair renders both variants.
          .filter((img) => img.getClientRects().length > 0)
          .map((img) => ({
            src: img.getAttribute('src') ?? '',
            alt: img.getAttribute('alt'),
            loaded: img.complete && img.naturalWidth > 0,
          })),
      );
      for (const image of images) {
        expect(image.alt?.trim(), `no alt text on ${image.src}`).toBeTruthy();
        expect(image.loaded, `${image.src} did not load`).toBe(true);
      }
    });
  }
});

test.describe('Marketing pages – tap targets on a phone (JEF-681)', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test('the header controls are at least 44px tall and wide', async ({ page }) => {
    await open(page, '/');
    const small = await page.evaluate((min) => {
      const controls = [...document.querySelectorAll('header a, header button')];
      return controls
        .map((el) => ({ el, box: el.getBoundingClientRect() }))
        .filter(({ box }) => box.width > 0 && (box.width < min || box.height < min))
        .map(
          ({ el, box }) =>
            `${el.getAttribute('aria-label') ?? el.textContent?.trim()} ${Math.round(box.width)}x${Math.round(box.height)}`,
        );
    }, MIN_TAP_PX);
    expect(small, 'header controls under 44px').toEqual([]);
  });
});

test.describe('Marketing header – keyboard (JEF-681)', () => {
  /** Whether the focused element draws an outline or a ring (box-shadow). */
  async function focusIsVisible(page: Page): Promise<boolean> {
    return page.evaluate(() => {
      const el = document.activeElement;
      if (!el || el === document.body) return false;
      const style = getComputedStyle(el);
      const outline = style.outlineStyle !== 'none' && parseFloat(style.outlineWidth) > 0;
      const ring = style.boxShadow !== 'none';
      return outline || ring;
    });
  }

  async function tabThroughHeader(page: Page): Promise<string[]> {
    const stops: string[] = [];
    for (let i = 0; i < 12; i += 1) {
      await page.keyboard.press('Tab');
      const inHeader = await page.evaluate(() => !!document.activeElement?.closest('header'));
      if (!inHeader) break;
      expect(await focusIsVisible(page), `focus not visible on stop ${i + 1}`).toBe(true);
      stops.push(
        await page.evaluate(
          () =>
            document.activeElement?.getAttribute('aria-label') ??
            document.activeElement?.textContent?.trim() ??
            '',
        ),
      );
    }
    return stops;
  }

  test('desktop: tab order follows the visual order and focus is visible', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await open(page, '/pricing');
    const stops = await tabThroughHeader(page);
    // Brand, then the nav in reading order, then the sign-up button, then the language picker.
    expect(stops).toHaveLength(7);
    expect(stops[1]).toMatch(/features/i);
    expect(stops[2]).toMatch(/pricing/i);
    expect(stops[3]).toMatch(/guides/i);
    expect(stops[5]).toMatch(/free/i);
  });

  test('phone: the menu opens from the keyboard, its links follow the button', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await open(page, '/pricing');
    const stops = await tabThroughHeader(page);
    expect(stops.at(-1)).toBe('Open menu');

    const menu = page.getByRole('button', { name: 'Open menu' });
    await menu.focus();
    // The page may not have hydrated yet, so a first Enter can do nothing:
    // press it only while the menu is still closed.
    await expect(async () => {
      if (await menu.isVisible()) await page.keyboard.press('Enter');
      await expect(page.getByRole('button', { name: 'Close menu' })).toBeFocused({ timeout: 500 });
    }).toPass();

    // The menu's links come straight after the button in the tab order.
    await page.keyboard.press('Tab');
    expect(await focusIsVisible(page)).toBe(true);
    await expect(page.locator('header').getByRole('link', { name: /features/i })).toBeFocused();
  });
});

test.describe('Marketing FAQ – keyboard (JEF-681)', () => {
  test('a question takes focus with a visible outline and opens with Enter and Space', async ({
    page,
  }) => {
    await open(page, '/pricing');
    const summary = page.locator('details > summary').first();
    await summary.scrollIntoViewIfNeeded();
    await summary.focus();
    await page.keyboard.press('Tab');
    await page.keyboard.press('Shift+Tab');
    await expect(summary).toBeFocused();
    const outline = await summary.evaluate((el) => getComputedStyle(el).outlineStyle);
    expect(outline).not.toBe('none');

    const details = page.locator('details').first();
    await expect(details).not.toHaveAttribute('open', '');
    await page.keyboard.press('Enter');
    await expect(details).toHaveAttribute('open', '');
    await page.keyboard.press('Space');
    await expect(details).not.toHaveAttribute('open', '');
  });
});
