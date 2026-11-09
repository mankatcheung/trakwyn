import pixelmatch from 'pixelmatch';

/** Decoded RGBA pixels, four bytes each. */
export interface RawImage {
  data: Uint8Array | Uint8ClampedArray;
  width: number;
  height: number;
}

/**
 * How different one pixel must be to count (pixelmatch's 0 to 1 scale). Looser
 * than its 0.1 default because the stored image is lossy WebP and the new one
 * is not: re-encoding noise around text edges must not read as a change.
 */
export const PIXEL_THRESHOLD = 0.2;

/** Share of pixels that may differ before a screenshot counts as changed. */
export const CHANGED_PIXEL_RATIO = 0.001;

/**
 * Whether `next` differs visibly from `existing`. A missing image or a size
 * change always does. Capture mode only writes when this is true, so a rerun
 * with no UI change leaves `git status` clean.
 */
export function differsVisibly(existing: RawImage | null, next: RawImage): boolean {
  if (!existing) return true;
  if (existing.width !== next.width || existing.height !== next.height) return true;
  const changed = pixelmatch(existing.data, next.data, null, next.width, next.height, {
    threshold: PIXEL_THRESHOLD,
  });
  return changed / (next.width * next.height) > CHANGED_PIXEL_RATIO;
}
