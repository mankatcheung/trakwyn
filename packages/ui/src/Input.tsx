import type { InputHTMLAttributes } from 'react';

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  invalid?: boolean;
}

/**
 * Single-line text input with a bordered, rounded style and an `invalid`
 * state for form validation errors.
 *
 * @category Forms
 */
export function Input({ invalid = false, className, ...rest }: InputProps) {
  const classes = [
    'w-full px-3 py-2 border rounded-lg text-sm bg-white dark:bg-stone-700 text-stone-900 dark:text-stone-100 placeholder-stone-400 disabled:opacity-60 focus:outline-none focus:ring-2',
    invalid
      ? 'border-red-500 dark:border-red-500 focus:ring-red-500'
      : 'border-stone-300 dark:border-stone-600 focus:ring-blue-500',
    className ?? '',
  ]
    .filter(Boolean)
    .join(' ');

  return <input aria-invalid={invalid || undefined} className={classes} {...rest} />;
}
