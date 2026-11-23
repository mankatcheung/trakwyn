import type { HTMLAttributes } from 'react';

export type SkeletonProps = HTMLAttributes<HTMLDivElement>;

/**
 * Loading placeholder — a pulsing gray block. Ships no default size or
 * corner radius (call sites range from small stat placeholders to
 * full chart-sized blocks, with varying rounding) — pass both via
 * `className`.
 *
 * @category Feedback
 */
export function Skeleton({ className, ...rest }: SkeletonProps) {
  const classes = ['bg-stone-100 dark:bg-stone-800 animate-pulse', className ?? '']
    .filter(Boolean)
    .join(' ');

  return <div className={classes} {...rest} />;
}
