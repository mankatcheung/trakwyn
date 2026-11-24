import type { ButtonHTMLAttributes, ReactNode } from 'react';

export type ButtonVariant = 'primary' | 'destructive' | 'secondary' | 'ghost' | 'link';
export type ButtonSize = 'sm' | 'md';

const VARIANT_CLASSES: Record<ButtonVariant, string> = {
  primary:
    'bg-blue-800 dark:bg-blue-700 hover:bg-blue-900 dark:hover:bg-blue-600 disabled:opacity-60 text-white font-medium transition-colors',
  destructive:
    'bg-red-600 hover:bg-red-700 disabled:opacity-60 text-white font-medium transition-colors',
  secondary:
    'border border-stone-300 dark:border-stone-600 text-stone-700 dark:text-stone-200 hover:bg-stone-50 dark:hover:bg-stone-700 disabled:opacity-60 font-medium transition-colors',
  ghost:
    'text-stone-600 dark:text-stone-400 hover:text-stone-900 dark:hover:text-stone-100 disabled:opacity-60 font-medium transition-colors',
  link: 'text-blue-800 dark:text-blue-400 hover:underline disabled:opacity-60 font-medium',
};

const SIZE_CLASSES: Record<ButtonVariant, Record<ButtonSize, string>> = {
  primary: { sm: 'px-3 py-1.5 text-xs rounded-lg', md: 'px-4 py-2 text-sm rounded-lg' },
  destructive: { sm: 'px-3 py-1.5 text-xs rounded-lg', md: 'px-4 py-2 text-sm rounded-lg' },
  secondary: { sm: 'px-3 py-1.5 text-xs rounded-lg', md: 'px-4 py-2 text-sm rounded-lg' },
  ghost: { sm: 'px-3 py-1.5 text-xs rounded-lg', md: 'px-4 py-2 text-sm rounded-lg' },
  link: { sm: 'text-xs', md: 'text-sm' },
};

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  fullWidth?: boolean;
  children: ReactNode;
}

/**
 * Standard clickable button with 5 visual variants and 2 sizes.
 *
 * @category Actions
 */
export function Button({
  variant = 'primary',
  size = 'md',
  fullWidth = false,
  type = 'button',
  className,
  children,
  ...rest
}: ButtonProps) {
  const classes = [
    VARIANT_CLASSES[variant],
    SIZE_CLASSES[variant][size],
    fullWidth ? 'w-full' : '',
    className ?? '',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <button type={type} className={classes} {...rest}>
      {children}
    </button>
  );
}
