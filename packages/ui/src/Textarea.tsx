import type { ComponentProps } from 'react';

/** Takes `ref` like any React 19 prop, so callers can measure the element (the chat composer's auto-grow). */
export interface TextareaProps extends ComponentProps<'textarea'> {
  invalid?: boolean;
}

/**
 * Multi-line text input — same bordered/rounded style and `invalid` state
 * as `Input`, non-resizable by default (matches every use of it in this app).
 *
 * @category Forms
 */
export function Textarea({ invalid = false, className, ...rest }: TextareaProps) {
  const classes = [
    'w-full px-3 py-2 border rounded-lg text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 placeholder-gray-400 disabled:opacity-60 focus:outline-none focus:ring-2 resize-none',
    invalid
      ? 'border-red-500 dark:border-red-500 focus:ring-red-500'
      : 'border-gray-300 dark:border-gray-600 focus:ring-blue-500',
    className ?? '',
  ]
    .filter(Boolean)
    .join(' ');

  return <textarea aria-invalid={invalid || undefined} className={classes} {...rest} />;
}
