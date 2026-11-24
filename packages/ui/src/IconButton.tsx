import type { ButtonHTMLAttributes, ReactNode } from 'react';

export type IconButtonVariant = 'default' | 'danger' | 'subtle';
export type IconButtonSize = 'sm' | 'md';

const VARIANT_CLASSES: Record<IconButtonVariant, string> = {
  default: 'text-stone-400 hover:text-stone-700 dark:hover:text-stone-200',
  danger: 'text-stone-400 hover:text-red-600 dark:hover:text-red-400',
  subtle:
    'text-stone-400 hover:bg-stone-100 hover:text-stone-700 dark:hover:bg-stone-700 dark:hover:text-stone-200',
};

const SIZE_CLASSES: Record<IconButtonSize, string> = {
  sm: 'p-1 rounded',
  md: 'p-1.5 rounded-lg',
};

export interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  /** Accessible name — required since the button has no visible text. */
  label: string;
  icon: ReactNode;
  variant?: IconButtonVariant;
  size?: IconButtonSize;
}

/**
 * Icon-only button (close, delete, external-link, ...) with a required
 * `label` for accessibility since there's no visible text.
 *
 * @category Actions
 */
export function IconButton({
  label,
  icon,
  variant = 'default',
  size = 'md',
  type = 'button',
  className,
  ...rest
}: IconButtonProps) {
  const classes = [
    VARIANT_CLASSES[variant],
    SIZE_CLASSES[size],
    // Flex-centering blockifies the icon (e.g. MarketingThemeToggle's inline
    // .theme-toggle-icon span) so it can't sit on the text baseline — that
    // added the font's descent to the line box and made buttons taller than
    // their padding+icon arithmetic, visibly next to fixed-height siblings.
    'flex items-center justify-center',
    'disabled:opacity-30 disabled:cursor-not-allowed transition-colors',
    className ?? '',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <button type={type} aria-label={label} title={label} className={classes} {...rest}>
      {icon}
    </button>
  );
}
