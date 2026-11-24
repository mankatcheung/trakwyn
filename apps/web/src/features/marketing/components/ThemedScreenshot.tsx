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
 */
export function ThemedScreenshot({
  name,
  priority = false,
  bleed = false,
}: {
  name: ScreenshotName;
  /**
   * Edge to edge below the `sm` breakpoint (JEF-675): no rounding and no side
   * borders, so a hero screenshot on a phone uses the whole width.
   */
  bleed?: boolean;
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
  const frame = bleed ? 'rounded-none border-x-0 sm:rounded-2xl sm:border-x' : 'rounded-2xl border';
  const shared = `mx-auto h-auto w-full ${frame} border-stone-200 shadow-sm dark:border-stone-800`;
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
