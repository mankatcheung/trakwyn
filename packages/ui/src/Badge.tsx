import type { ReactNode } from 'react';

export type BadgeTone =
  'gray' | 'slate' | 'blue' | 'purple' | 'yellow' | 'orange' | 'green' | 'red' | 'emerald';

const TONE_CLASSES: Record<BadgeTone, string> = {
  gray: 'bg-stone-100 text-stone-700 dark:bg-stone-700 dark:text-stone-300',
  slate: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300',
  blue: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
  purple: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400',
  yellow: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400',
  orange: 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400',
  green: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
  red: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
  emerald: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400',
};

export interface BadgeProps {
  tone?: BadgeTone;
  children: ReactNode;
  className?: string;
}

/**
 * Small rounded pill for status/tag labels, in one of 9 tone colors.
 *
 * @category Feedback
 */
export function Badge({ tone = 'gray', children, className }: BadgeProps) {
  const classes = [
    'inline-flex items-center text-xs font-medium px-2 py-0.5 rounded-full',
    TONE_CLASSES[tone],
    className ?? '',
  ]
    .filter(Boolean)
    .join(' ');

  return <span className={classes}>{children}</span>;
}
