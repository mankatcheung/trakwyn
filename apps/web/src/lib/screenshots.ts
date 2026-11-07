/**
 * Real screenshots of the app (JEF-528), captured from the seeded demo account
 * by `pnpm --filter @trakwyn/web screenshots` and committed under
 * `public/screenshots/`. This manifest is the single source for the capture
 * script and for pages: `width` and `height` are the image's pixel size, so an
 * `<img>` can reserve its space and avoid layout shift.
 */
export const SCREENSHOT_THEMES = ['light', 'dark'] as const;
export type ScreenshotTheme = (typeof SCREENSHOT_THEMES)[number];

/** Chromium is run at this device scale factor, so images are 2x the viewport. */
export const SCREENSHOT_SCALE = 2;
/** About 150 KB; the test fails above this so a page never ships a heavy image. */
export const SCREENSHOT_MAX_BYTES = 150 * 1024;

export interface ScreenshotScreen {
  name: string;
  /** CSS pixels of the browser viewport; the image is this times the scale. */
  viewport: { width: number; height: number };
  altKey: string;
}

export const SCREENSHOT_SCREENS = [
  // About 1100 wide: shrunk to a max-w-4xl column the text stays readable.
  { name: 'board', viewport: { width: 1100, height: 700 }, altKey: 'screenshots.board.alt' },
  {
    name: 'application-detail',
    viewport: { width: 1100, height: 760 },
    altKey: 'screenshots.applicationDetail.alt',
  },
  {
    name: 'assistant',
    viewport: { width: 1100, height: 700 },
    altKey: 'screenshots.assistant.alt',
  },
  { name: 'resume', viewport: { width: 1100, height: 760 }, altKey: 'screenshots.resume.alt' },
  {
    name: 'analytics',
    viewport: { width: 1100, height: 760 },
    altKey: 'screenshots.analytics.alt',
  },
] as const satisfies readonly ScreenshotScreen[];

export type ScreenshotName = (typeof SCREENSHOT_SCREENS)[number]['name'];

export interface Screenshot {
  name: ScreenshotName;
  theme: ScreenshotTheme;
  /** Public URL, e.g. `/screenshots/board-light.webp`. */
  src: string;
  width: number;
  height: number;
  altKey: string;
}

export function screenshotFile(name: string, theme: ScreenshotTheme): string {
  return `${name}-${theme}.webp`;
}

export const SCREENSHOTS: readonly Screenshot[] = SCREENSHOT_SCREENS.flatMap((screen) =>
  SCREENSHOT_THEMES.map((theme) => ({
    name: screen.name,
    theme,
    src: `/screenshots/${screenshotFile(screen.name, theme)}`,
    width: screen.viewport.width * SCREENSHOT_SCALE,
    height: screen.viewport.height * SCREENSHOT_SCALE,
    altKey: screen.altKey,
  })),
);

export function getScreenshot(name: ScreenshotName, theme: ScreenshotTheme): Screenshot {
  const found = SCREENSHOTS.find((s) => s.name === name && s.theme === theme);
  if (!found) throw new Error(`No screenshot ${name}/${theme}`);
  return found;
}
