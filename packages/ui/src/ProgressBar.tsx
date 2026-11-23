import type { HTMLAttributes } from 'react';

export interface ProgressBarProps extends HTMLAttributes<HTMLDivElement> {
  value: number;
  max: number;
}

/**
 * Determinate progress bar — a rounded track with a filled bar sized to
 * `value / max`, clamped to 0–100%.
 *
 * @category Feedback
 */
export function ProgressBar({ value, max, className, ...rest }: ProgressBarProps) {
  const percent = Math.min(100, Math.max(0, (value / max) * 100));
  const classes = [
    'h-2 overflow-hidden rounded-full bg-white/80 dark:bg-stone-700',
    className ?? '',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <div
      role="progressbar"
      aria-valuenow={value}
      aria-valuemin={0}
      aria-valuemax={max}
      className={classes}
      {...rest}
    >
      <div
        className="h-full rounded-full bg-blue-800 dark:bg-blue-700 transition-[width]"
        style={{ width: `${percent}%` }}
      />
    </div>
  );
}
