import {
  getPhoneScreenshot,
  getScreenshot,
  PHONE_MEDIA_QUERY,
  SCREENSHOT_SCALE,
  type Screenshot,
  type ScreenshotName,
} from '#/features/marketing/lib/screenshots';
import { useLocale } from '#/lib/i18n';

/**
 * A real app screenshot (JEF-528) in the light or dark variant that matches
 * the site's theme. Both images are rendered and CSS picks one with the
 * `dark` class (the one `THEME_INIT_SCRIPT` and the manual toggle set, unlike
 * `prefers-color-scheme`). Lazy images that are `display: none` are not
 * fetched, so only the visible theme downloads. Width and height come from
 * the manifest so the space is reserved and nothing shifts.
 *
 * A screenshot with a phone variant (JEF-684) is a `<picture>`: below the `sm`
 * breakpoint the browser takes the phone capture, made in a 390 px viewport so
 * its text is readable, instead of a desktop image shrunk to the same width.
 * The `<source>` carries its own width and height, so the space it reserves
 * has the phone image's shape and nothing shifts.
 *
 * A full-screen phone capture is drawn as a device: narrower than the screen,
 * with a thick bezel. Edge to edge, it read as the page's own interface on a
 * real phone. A crop is only a region of the app, so it keeps the plain frame.
 */
export function ThemedScreenshot({
  name,
  priority = false,
}: {
  name: ScreenshotName;
  /**
   * An above-the-fold image (the likely LCP): high priority. Both images stay
   * lazy, because a hidden eager image is still fetched and most visitors would
   * download it for nothing. The page's `head` preloads the variant for the
   * visitor's colour scheme (`heroPreloadLinks`, JEF-682), so it is requested
   * from the HTML instead of after layout; the lazy `<img>` then reuses it.
   */
  priority?: boolean;
}) {
  const { t } = useLocale();
  const light = getScreenshot(name, 'light');
  const dark = getScreenshot(name, 'dark');
  const alt = t(light.altKey);
  const device = !name.startsWith('crop-') && getPhoneScreenshot(name, 'light') !== undefined;
  const frame = device
    ? 'w-72 rounded-4xl border-8 border-stone-800 sm:w-full sm:rounded-2xl sm:border sm:border-stone-200 dark:border-stone-700 dark:sm:border-stone-800'
    : 'w-full rounded-2xl border border-stone-200 dark:border-stone-800';
  const shared = `mx-auto h-auto ${frame} shadow-sm`;
  // A small crop is shown at its own size at most, never stretched past its pixels.
  const style = { maxWidth: light.width / SCREENSHOT_SCALE };
  const image = (shot: Screenshot, phone: Screenshot | undefined, className: string) => (
    <picture className="contents">
      {phone && (
        <source
          media={PHONE_MEDIA_QUERY}
          srcSet={phone.src}
          width={phone.width}
          height={phone.height}
        />
      )}
      <img
        src={shot.src}
        width={shot.width}
        height={shot.height}
        alt={alt}
        loading="lazy"
        fetchPriority={priority ? 'high' : undefined}
        decoding="async"
        style={style}
        className={className}
      />
    </picture>
  );
  return (
    <>
      {image(light, getPhoneScreenshot(name, 'light'), `${shared} dark:hidden`)}
      {image(dark, getPhoneScreenshot(name, 'dark'), `${shared} hidden dark:block`)}
    </>
  );
}
