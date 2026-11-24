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

/** The app state the capture script opens before it photographs a screen. */
export type ScreenshotScene =
  | 'board'
  | 'application-detail'
  | 'assistant'
  | 'assistant-conversation'
  | 'resume'
  | 'cover-letter'
  | 'analytics'
  | 'new-application'
  | 'notifications'
  | 'applications'
  | 'settings-ai';

export interface ScreenshotScreen {
  name: string;
  /** CSS pixels of the browser viewport. A full screen is this times the scale. */
  viewport: { width: number; height: number };
  altKey: string;
  /** The scene to open; defaults to the screen's own name. */
  scene?: ScreenshotScene;
  /**
   * A crop (JEF-674): the value of a `data-screenshot` attribute in the app.
   * The image starts at that element's top-left corner and is `crop` CSS
   * pixels, so it may take in what follows the element. Needs `crop`.
   */
  target?: string;
  /** CSS pixels of a cropped image; the image is this times the scale. */
  crop?: { width: number; height: number };
}

/** Crops are photographed in a viewport tall enough for the region they start at. */
const CROP_VIEWPORT = { width: 1100, height: 900 } as const;

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
    name: 'cover-letter',
    viewport: { width: 1100, height: 760 },
    altKey: 'screenshots.coverLetter.alt',
  },
  {
    name: 'analytics',
    viewport: { width: 1100, height: 760 },
    altKey: 'screenshots.analytics.alt',
  },
  // Crops (JEF-674) for the features index and the benefit rows: real regions
  // of the seeded demo account, found by a `data-screenshot` hook in the app.
  {
    name: 'crop-board-columns',
    scene: 'board',
    target: 'board-column-draft',
    viewport: CROP_VIEWPORT,
    crop: { width: 744, height: 330 },
    altKey: 'screenshots.cropBoardColumns.alt',
  },
  {
    name: 'crop-assistant-reply',
    scene: 'assistant-conversation',
    target: 'assistant-reply',
    viewport: CROP_VIEWPORT,
    crop: { width: 560, height: 300 },
    altKey: 'screenshots.cropAssistantReply.alt',
  },
  {
    name: 'crop-resume-editor',
    scene: 'resume',
    target: 'draft-editor',
    viewport: CROP_VIEWPORT,
    crop: { width: 484, height: 300 },
    altKey: 'screenshots.cropResumeEditor.alt',
  },
  {
    name: 'crop-stage-funnel',
    scene: 'analytics',
    target: 'stage-funnel',
    viewport: CROP_VIEWPORT,
    crop: { width: 796, height: 290 },
    altKey: 'screenshots.cropStageFunnel.alt',
  },
  {
    name: 'crop-new-application-import',
    scene: 'new-application',
    target: 'jd-import',
    viewport: CROP_VIEWPORT,
    crop: { width: 608, height: 300 },
    altKey: 'screenshots.cropNewApplicationImport.alt',
  },
  {
    name: 'crop-board-header',
    scene: 'board',
    target: 'board-header',
    viewport: CROP_VIEWPORT,
    crop: { width: 812, height: 140 },
    altKey: 'screenshots.cropBoardHeader.alt',
  },
  {
    name: 'crop-notifications',
    scene: 'notifications',
    target: 'notification-popover',
    viewport: CROP_VIEWPORT,
    crop: { width: 384, height: 300 },
    altKey: 'screenshots.cropNotifications.alt',
  },
  {
    name: 'crop-assistant-suggestions',
    scene: 'assistant',
    target: 'assistant-suggestions',
    viewport: CROP_VIEWPORT,
    crop: { width: 560, height: 110 },
    altKey: 'screenshots.cropAssistantSuggestions.alt',
  },
  {
    name: 'crop-ai-providers',
    scene: 'settings-ai',
    target: 'add-llm-key',
    viewport: CROP_VIEWPORT,
    crop: { width: 560, height: 260 },
    altKey: 'screenshots.cropAiProviders.alt',
  },
  {
    name: 'crop-chat-history',
    scene: 'assistant-conversation',
    target: 'chat-history',
    viewport: CROP_VIEWPORT,
    crop: { width: 190, height: 140 },
    altKey: 'screenshots.cropChatHistory.alt',
  },
  {
    name: 'crop-analytics-stats',
    scene: 'analytics',
    target: 'analytics-stats',
    viewport: CROP_VIEWPORT,
    crop: { width: 796, height: 90 },
    altKey: 'screenshots.cropAnalyticsStats.alt',
  },
  {
    name: 'crop-ghosted',
    scene: 'applications',
    target: 'application-filters',
    viewport: CROP_VIEWPORT,
    crop: { width: 796, height: 56 },
    altKey: 'screenshots.cropGhosted.alt',
  },
  {
    name: 'crop-channels',
    scene: 'analytics',
    target: 'channel-analytics',
    viewport: CROP_VIEWPORT,
    crop: { width: 796, height: 300 },
    altKey: 'screenshots.cropChannels.alt',
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

/** The CSS size of a screen's image: its crop, or the whole viewport. */
export function screenshotSize(screen: ScreenshotScreen): { width: number; height: number } {
  return screen.crop ?? screen.viewport;
}

export const SCREENSHOTS: readonly Screenshot[] = SCREENSHOT_SCREENS.flatMap((screen) =>
  SCREENSHOT_THEMES.map((theme) => ({
    name: screen.name,
    theme,
    src: `/screenshots/${screenshotFile(screen.name, theme)}`,
    width: screenshotSize(screen).width * SCREENSHOT_SCALE,
    height: screenshotSize(screen).height * SCREENSHOT_SCALE,
    altKey: screen.altKey,
  })),
);

export function getScreenshot(name: ScreenshotName, theme: ScreenshotTheme): Screenshot {
  const found = SCREENSHOTS.find((s) => s.name === name && s.theme === theme);
  if (!found) throw new Error(`No screenshot ${name}/${theme}`);
  return found;
}
