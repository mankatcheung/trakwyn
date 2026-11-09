import { describe, expect, it } from 'vitest';
import { CHANGED_PIXEL_RATIO, differsVisibly, type RawImage } from '../../../e2e/guides/imageDiff';

/** A solid white RGBA image. */
function blank(width: number, height: number): RawImage {
  return { data: new Uint8Array(width * height * 4).fill(255), width, height };
}

/** `image` with its first `count` pixels painted black. */
function withBlackPixels(image: RawImage, count: number): RawImage {
  const data = new Uint8Array(image.data);
  for (let i = 0; i < count; i++) data.set([0, 0, 0, 255], i * 4);
  return { ...image, data };
}

describe('differsVisibly', () => {
  const size = 100;
  const total = size * size;

  it('writes an image that does not exist yet', () => {
    expect(differsVisibly(null, blank(size, size))).toBe(true);
  });

  it('skips an identical image', () => {
    expect(differsVisibly(blank(size, size), blank(size, size))).toBe(false);
  });

  it('writes when the size changed, even if every pixel matches', () => {
    expect(differsVisibly(blank(size, size), blank(size, size + 1))).toBe(true);
  });

  it('skips a change within the allowed share of pixels', () => {
    const allowed = Math.floor(total * CHANGED_PIXEL_RATIO);
    expect(differsVisibly(blank(size, size), withBlackPixels(blank(size, size), allowed))).toBe(
      false,
    );
  });

  it('writes a change past the allowed share of pixels', () => {
    const past = Math.ceil(total * CHANGED_PIXEL_RATIO) + 1;
    expect(differsVisibly(blank(size, size), withBlackPixels(blank(size, size), past))).toBe(true);
  });

  it('skips a colour shift too small to see (lossy re-encoding noise)', () => {
    const next = blank(size, size);
    next.data.fill(250); // 5/255 off on every channel
    expect(differsVisibly(blank(size, size), next)).toBe(false);
  });

  it('writes a clearly different colour across the page', () => {
    const next = blank(size, size);
    next.data.fill(120);
    expect(differsVisibly(blank(size, size), next)).toBe(true);
  });
});
