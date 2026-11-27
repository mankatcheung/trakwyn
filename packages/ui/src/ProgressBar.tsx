import type { HTMLAttributes } from 'react';

export interface ProgressBarProps extends HTMLAttributes<HTMLDivElement> {
  value: number;
  max: number;
  /**
   * `accent` fills in the brand blue, for a bar still on its way. `complete`
   * fills in green, for a bar that has reached its goal.
   */
  tone?: 'accent' | 'complete';
}

/**
 * Determinate progress bar — a rounded track with a filled bar sized to
 * `value / max`, clamped to 0–100%.
 *
 * @category Feedback
 */
export function ProgressBar({ value, max, tone = 'accent', className, ...rest }: ProgressBarProps) {
  const percent = Math.min(100, Math.max(0, (value / max) * 100));
  const classes = [
    'h-2 overflow-hidden rounded-full bg-stone-200 dark:bg-stone-700',
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
        className={`h-full rounded-full transition-[width] ${
          tone === 'complete' ? 'bg-green-600 dark:bg-green-500' : 'bg-blue-800 dark:bg-blue-700'
        }`}
        style={{ width: `${percent}%` }}
      />
    </div>
  );
}
