import type { LinkTag } from '#/lib/seo';
import {
  DESKTOP_MEDIA_QUERY,
  getPhoneScreenshot,
  getScreenshot,
  PHONE_MEDIA_QUERY,
  SCREENSHOT_THEMES,
  type ScreenshotName,
} from '../lib/screenshots';

/**
 * Preload links for a page's hero screenshot (JEF-682). The screenshot is the
 * LCP element, and `ThemedScreenshot` keeps both variants lazy so the hidden
 * one is never fetched; a lazy image is only found after layout, which on a
 * throttled phone is late. Each link is limited to its colour scheme, so the
 * browser starts only the variant the visitor will see, straight from the HTML.
 * A visitor who picked the other theme by hand loses nothing: the lazy image
 * still loads as before.
 *
 * A hero with a phone variant (JEF-684) is preloaded once per size, each limited
 * to its own width as well, so a phone fetches the phone image and a desktop the
 * desktop image, never both.
 */
export function heroPreloadLinks(name: ScreenshotName): LinkTag[] {
  return SCREENSHOT_THEMES.flatMap((theme) => {
    const scheme = `(prefers-color-scheme: ${theme})`;
    const link = (href: string, media: string): LinkTag => ({
      rel: 'preload',
      as: 'image',
      href,
      media,
      fetchPriority: 'high' as const,
    });
    const phone = getPhoneScreenshot(name, theme);
    const desktop = getScreenshot(name, theme);
    if (!phone) return [link(desktop.src, scheme)];
    return [
      link(phone.src, `${PHONE_MEDIA_QUERY} and ${scheme}`),
      link(desktop.src, `${DESKTOP_MEDIA_QUERY} and ${scheme}`),
    ];
  });
}
