import { getScreenshot, type ScreenshotName } from '#/lib/screenshots';
import { useLocale } from '#/lib/i18n';

/**
 * A real app screenshot (JEF-528) in the light or dark variant that matches
 * the site's theme. Both images are rendered and CSS picks one with the
 * `dark` class (the one `THEME_INIT_SCRIPT` and the manual toggle set, unlike
 * `prefers-color-scheme`). Lazy images that are `display: none` are not
 * fetched, so only the visible theme downloads. Width and height come from
 * the manifest so the space is reserved and nothing shifts.
 */
export function ThemedScreenshot({
  name,
  priority = false,
}: {
  name: ScreenshotName;
  /**
   * An above-the-fold image (the likely LCP): high priority, and the light
   * image is eager. The dark image stays lazy, because a hidden eager image is
   * still fetched and most visitors would download it for nothing; in dark mode
   * it is visible and loads as soon as layout is known, at high priority.
   */
  priority?: boolean;
}) {
  const { t } = useLocale();
  const light = getScreenshot(name, 'light');
  const dark = getScreenshot(name, 'dark');
  const alt = t(light.altKey);
  const shared =
    'h-auto w-full rounded-2xl border border-gray-200 shadow-lg shadow-gray-900/5 dark:border-gray-800';
  return (
    <>
      <img
        src={light.src}
        width={light.width}
        height={light.height}
        alt={alt}
        loading={priority ? 'eager' : 'lazy'}
        fetchPriority={priority ? 'high' : undefined}
        decoding="async"
        className={`${shared} dark:hidden`}
      />
      <img
        src={dark.src}
        width={dark.width}
        height={dark.height}
        alt={alt}
        loading="lazy"
        fetchPriority={priority ? 'high' : undefined}
        decoding="async"
        className={`${shared} hidden dark:block`}
      />
    </>
  );
}
