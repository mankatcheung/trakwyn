import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import en from '#/i18n/en.json';
import {
  getPhoneScreenshot,
  getScreenshot,
  SCREENSHOT_MAX_BYTES,
  SCREENSHOT_SCALE,
  SCREENSHOT_SCREENS,
  SCREENSHOT_THEMES,
  screenshotSize,
  SCREENSHOTS,
} from '#/features/marketing/lib/screenshots';

const srcDir = join(import.meta.dirname, '..', '..', '..', '..');
const publicDir = join(import.meta.dirname, '..', '..', '..', '..', '..', 'public');

/** Width and height from a lossy ('VP8 '), lossless ('VP8L') or extended ('VP8X') WebP header. */
function webpSize(file: string): { width: number; height: number } {
  const b = readFileSync(file);
  expect(b.toString('ascii', 0, 4)).toBe('RIFF');
  expect(b.toString('ascii', 8, 12)).toBe('WEBP');
  const chunk = b.toString('ascii', 12, 16);
  if (chunk === 'VP8 ') {
    return { width: b.readUInt16LE(26) & 0x3fff, height: b.readUInt16LE(28) & 0x3fff };
  }
  if (chunk === 'VP8L') {
    const bits = b.readUInt32LE(21);
    return { width: (bits & 0x3fff) + 1, height: ((bits >> 14) & 0x3fff) + 1 };
  }
  if (chunk === 'VP8X') {
    return { width: b.readUIntLE(24, 3) + 1, height: b.readUIntLE(27, 3) + 1 };
  }
  throw new Error(`Unknown WebP chunk ${chunk}`);
}

describe('screenshot manifest', () => {
  it('has every screen in every theme', () => {
    expect(SCREENSHOTS).toHaveLength(SCREENSHOT_SCREENS.length * SCREENSHOT_THEMES.length);
    expect(new Set(SCREENSHOTS.map((s) => s.src)).size).toBe(SCREENSHOTS.length);
  });

  it('sizes each image as its viewport times the device scale factor', () => {
    const board = SCREENSHOT_SCREENS[0];
    const shot = getScreenshot('board', 'light');
    expect(shot.width).toBe(board.viewport.width * SCREENSHOT_SCALE);
    expect(shot.height).toBe(board.viewport.height * SCREENSHOT_SCALE);
  });

  it('sizes a crop as its crop size times the device scale factor (JEF-674)', () => {
    const crop = SCREENSHOT_SCREENS.find((s) => s.name === 'crop-board-header');
    expect(crop).toBeDefined();
    const shot = getScreenshot('crop-board-header', 'dark');
    expect(shot.width).toBe(crop!.crop.width * SCREENSHOT_SCALE);
    expect(shot.height).toBe(crop!.crop.height * SCREENSHOT_SCALE);
    expect(screenshotSize(crop!)).toEqual(crop!.crop);
  });

  it('gives every crop a data-screenshot target and every target a crop', () => {
    const screens: readonly { name: string; target?: string; crop?: unknown }[] =
      SCREENSHOT_SCREENS;
    screens.forEach((screen) => {
      expect(Boolean(screen.target), `${screen.name} target`).toBe(Boolean(screen.crop));
      expect(screen.name.startsWith('crop-')).toBe(Boolean(screen.target));
    });
  });

  it('has a hook in the app for every crop target', () => {
    const targets = SCREENSHOT_SCREENS.flatMap((s) => ('target' in s ? [s.target] : []));
    expect(targets.length).toBeGreaterThan(0);
    const files = readdirSync(srcDir, { recursive: true, encoding: 'utf8' }).filter(
      (f) => /\.tsx$/.test(f) && !f.includes('__tests__'),
    );
    const source = files.map((f) => readFileSync(join(srcDir, f), 'utf8')).join('\n');
    targets.forEach((target) => {
      // A plain attribute, or an expression (the board column's is built from
      // its status, the assistant reply's depends on the message role).
      const found =
        source.includes(`data-screenshot="${target}"`) ||
        (source.includes(`'${target}'`) && source.includes('data-screenshot={')) ||
        (target.startsWith('board-column-') && source.includes('data-screenshot={`board-column-'));
      expect(found, `no data-screenshot="${target}" in src`).toBe(true);
    });
  });

  describe('phone variants (JEF-684)', () => {
    const phoneScreens = SCREENSHOT_SCREENS.filter((screen) => 'phoneOf' in screen);

    it('each stands in for a real desktop screen of the same scene and target', () => {
      expect(phoneScreens.length).toBeGreaterThan(0);
      for (const phone of phoneScreens) {
        const desktop = SCREENSHOT_SCREENS.find((s) => s.name === phone.phoneOf);
        expect(desktop, `${phone.name} stands in for ${phone.phoneOf}`).toBeTruthy();
        expect(phone.name).toBe(`${phone.phoneOf}-phone`);
        expect(phone.scene).toBe('scene' in desktop! ? desktop.scene : desktop!.name);
        expect('target' in phone ? phone.target : undefined).toBe(
          'target' in desktop! ? desktop.target : undefined,
        );
        expect(phone.altKey).toBe(desktop!.altKey);
      }
    });

    it('is captured at phone width, and a crop fits inside it', () => {
      for (const phone of phoneScreens) {
        expect(phone.viewport.width).toBeLessThanOrEqual(390);
        expect(screenshotSize(phone).width).toBeLessThanOrEqual(phone.viewport.width);
      }
    });

    it('is found from the desktop name, and only where one exists', () => {
      expect(getPhoneScreenshot('board', 'light')?.src).toBe('/screenshots/board-phone-light.webp');
      expect(getPhoneScreenshot('crop-board-header', 'dark')).toBeUndefined();
    });

    it('covers the heroes and the landing feature crops', () => {
      for (const name of [
        'board',
        'application-detail',
        'assistant',
        'resume',
        'analytics',
        'crop-board-columns',
        'crop-assistant-reply',
        'crop-resume-editor',
        'crop-stage-funnel',
      ] as const) {
        expect(getPhoneScreenshot(name, 'light'), name).toBeDefined();
      }
    });
  });

  it('throws for an unknown screenshot', () => {
    expect(() => getScreenshot('nope' as never, 'light')).toThrow(/No screenshot/);
  });

  it.each(SCREENSHOTS.map((s) => [s.src, s] as const))('%s', (_src, shot) => {
    const file = join(publicDir, shot.src);
    expect(
      existsSync(file),
      `${shot.src} is missing; run pnpm --filter @trakwyn/web screenshots`,
    ).toBe(true);
    expect(webpSize(file)).toEqual({ width: shot.width, height: shot.height });
    expect(statSync(file).size).toBeLessThanOrEqual(SCREENSHOT_MAX_BYTES);
    expect(Object.keys(en)).toContain(shot.altKey);
  });
});
