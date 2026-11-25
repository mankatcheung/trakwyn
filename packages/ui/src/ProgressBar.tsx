import type { HTMLAttributes } from 'react';

export interface ProgressBarProps extends HTMLAttributes<HTMLDivElement> {
  value: number;
  max: number;
  /**
   * `accent` fills in the brand blue. `quiet` fills in stone, for a bar that has
   * reached its goal and should stop asking for attention.
   */
  tone?: 'accent' | 'quiet';
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
        className={`h-full rounded-full transition-[width] ${
          tone === 'quiet' ? 'bg-stone-400 dark:bg-stone-500' : 'bg-blue-800 dark:bg-blue-700'
        }`}
        style={{ width: `${percent}%` }}
      />
    </div>
  );
}
