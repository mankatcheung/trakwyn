import { existsSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import en from '#/i18n/en.json';
import {
  getScreenshot,
  SCREENSHOT_MAX_BYTES,
  SCREENSHOT_SCALE,
  SCREENSHOT_SCREENS,
  SCREENSHOT_THEMES,
  SCREENSHOTS,
} from '#/lib/screenshots';

const publicDir = join(import.meta.dirname, '..', '..', '..', 'public');

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
