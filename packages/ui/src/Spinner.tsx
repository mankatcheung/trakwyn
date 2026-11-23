import type { HTMLAttributes } from 'react';

export type SpinnerSize = 'sm' | 'md';
export type SpinnerTone = 'gray' | 'white';

const SIZE_CLASSES: Record<SpinnerSize, string> = {
  sm: 'w-3.5 h-3.5 border-2',
  md: 'w-5 h-5 border-2',
};

const TONE_CLASSES: Record<SpinnerTone, string> = {
  gray: 'border-stone-300 border-t-transparent',
  white: 'border-white border-t-transparent',
};

export interface SpinnerProps extends HTMLAttributes<HTMLSpanElement> {
  size?: SpinnerSize;
  tone?: SpinnerTone;
}

/**
 * Inline loading indicator — a spinning ring. `size="sm"` (default) sits
 * next to a loading label; `size="md"` stands alone (e.g. infinite-scroll
 * fetch-more). `tone="gray"` (default) for neutral backgrounds,
 * `tone="white"` for use inside a filled colored button.
 *
 * @category Feedback
 */
export function Spinner({ size = 'sm', tone = 'gray', className, ...rest }: SpinnerProps) {
  const classes = [
    'inline-block rounded-full animate-spin',
    SIZE_CLASSES[size],
    TONE_CLASSES[tone],
    className ?? '',
  ]
    .filter(Boolean)
    .join(' ');

  return <span className={classes} {...rest} />;
}
