import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { buildManifest } from '../manifest';

/**
 * Holds the Web Store listing copy (`store/listing.md`, JEF-416) to the
 * dashboard's limits and to the manifest, since the store rejects or flags a
 * mismatch only at review time.
 */

const STORE_DIR = join(import.meta.dirname, '..', '..', 'store');
const listing = readFileSync(join(STORE_DIR, 'listing.md'), 'utf8');

const TITLE_MAX = 45;
const SHORT_DESCRIPTION_MAX = 132;

/** The text under a heading, up to the next heading of the same or a higher level. */
function section(heading: string): string {
  const level = heading.match(/^#+/)?.[0].length ?? 1;
  const lines = listing.split('\n');
  const start = lines.indexOf(heading);
  if (start === -1) throw new Error(`listing.md has no "${heading}" section`);
  const end = lines.findIndex((line, i) => {
    const hashes = i > start ? line.match(/^(#+) /)?.[1].length : undefined;
    return hashes !== undefined && hashes <= level;
  });
  return lines
    .slice(start + 1, end === -1 ? undefined : end)
    .join('\n')
    .trim();
}

function pngSize(path: string): { width: number; height: number; colorType: number } {
  const bytes = readFileSync(path);
  // IHDR: width and height are the first two uint32s after the 8-byte signature
  // and the chunk header; the colour type follows the bit depth.
  return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20), colorType: bytes[25] };
}

describe('store listing copy', () => {
  it('fits the dashboard limits', () => {
    expect(section('### Title').length).toBeLessThanOrEqual(TITLE_MAX);
    expect(section('### Short description').length).toBeLessThanOrEqual(SHORT_DESCRIPTION_MAX);
  });

  it('gives the contact and policy details the store requires', () => {
    expect(section('### Contact email')).toBe('contact@trakwyn.com');
    expect(section('### Privacy policy URL')).toBe('https://www.trakwyn.com/privacy');
    expect(section('### Single purpose')).not.toBe('');
    expect(section('### Remote code')).toMatch(/does not use remote code/);
  });

  it.each(buildManifest({ browser: 'chrome', command: 'build' }).permissions ?? [])(
    'justifies the %s permission',
    (permission) => {
      expect(section(`#### \`${permission}\``)).not.toBe('');
    },
  );

  it('justifies the content script hosts', () => {
    const justification = section('#### Content script hosts');

    for (const host of [
      'linkedin.com',
      'indeed.com',
      'glassdoor.com',
      'greenhouse.io',
      'lever.co',
      'workday.com',
      'myworkdayjobs.com',
    ]) {
      expect(justification).toContain(host);
    }
  });
});

describe('store listing assets', () => {
  const RGB_NO_ALPHA = 2;

  it.each([
    ['screenshot-1-clip.png', 1280, 800],
    ['screenshot-2-saved.png', 1280, 800],
    ['promo-tile-small.png', 440, 280],
  ])('sizes %s at %ix%i with no alpha channel', (file, width, height) => {
    expect(pngSize(join(STORE_DIR, 'assets', file))).toEqual({
      width,
      height,
      colorType: RGB_NO_ALPHA,
    });
  });
});
