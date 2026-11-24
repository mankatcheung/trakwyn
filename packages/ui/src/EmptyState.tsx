import type { HTMLAttributes, ReactNode } from 'react';

export type EmptyStateSize = 'default' | 'compact';

const SIZE_CLASSES: Record<EmptyStateSize, string> = {
  default: 'text-stone-500 dark:text-stone-400',
  compact: 'text-sm text-stone-400',
};

export interface EmptyStateProps extends HTMLAttributes<HTMLDivElement> {
  icon?: ReactNode;
  message: ReactNode;
  action?: ReactNode;
  size?: EmptyStateSize;
}

/**
 * "Nothing here yet" placeholder. `size="default"` (icon + message +
 * optional action link, for empty lists) supports an optional icon and
 * action. `size="compact"` is the text-only "no data yet" hint used
 * inside analytics panels — no icon, no action. Neither size sets a
 * default vertical padding (call sites range from `py-4` to `py-16`) —
 * pass it via `className`.
 *
 * @category Feedback
 */
export function EmptyState({
  icon,
  message,
  action,
  size = 'default',
  className,
  ...rest
}: EmptyStateProps) {
  const classes = ['text-center', SIZE_CLASSES[size], className ?? ''].filter(Boolean).join(' ');

  return (
    <div className={classes} {...rest}>
      {icon && (
        <div className="flex justify-center mx-auto mb-3 text-stone-300 dark:text-stone-600">
          {icon}
        </div>
      )}
      <p>{message}</p>
      {action}
    </div>
  );
}
