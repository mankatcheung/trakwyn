import type { LinkTag } from '#/lib/seo';
import { getScreenshot, SCREENSHOT_THEMES, type ScreenshotName } from '../lib/screenshots';

/**
 * Preload links for a page's hero screenshot (JEF-682). The screenshot is the
 * LCP element, and `ThemedScreenshot` keeps both variants lazy so the hidden
 * one is never fetched; a lazy image is only found after layout, which on a
 * throttled phone is late. Each link is limited to its colour scheme, so the
 * browser starts only the variant the visitor will see, straight from the HTML.
 * A visitor who picked the other theme by hand loses nothing: the lazy image
 * still loads as before.
 */
export function heroPreloadLinks(name: ScreenshotName): LinkTag[] {
  return SCREENSHOT_THEMES.map((theme) => ({
    rel: 'preload',
    as: 'image',
    href: getScreenshot(name, theme).src,
    media: `(prefers-color-scheme: ${theme})`,
    fetchPriority: 'high' as const,
  }));
}
