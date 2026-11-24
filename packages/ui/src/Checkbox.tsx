import type { InputHTMLAttributes } from 'react';

export type CheckboxSize = 'sm' | 'md';
export type CheckboxTone = 'blue' | 'yellow';

const SIZE_CLASSES: Record<CheckboxSize, string> = {
  sm: 'h-3.5 w-3.5',
  md: 'h-4 w-4',
};

const TONE_CLASSES: Record<CheckboxTone, string> = {
  blue: 'text-blue-800 dark:text-blue-400 focus:ring-blue-500',
  yellow: 'text-yellow-400 focus:ring-yellow-400',
};

export interface CheckboxProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'size'> {
  size?: CheckboxSize;
  tone?: CheckboxTone;
}

/**
 * Native `<input type="checkbox">` with the app's standard bordered/rounded
 * style. `size="md"` (default) for most uses, `size="sm"` for compact rows.
 * `tone="blue"` (default) for selection checkboxes, `tone="yellow"` for a
 * star/favorite toggle.
 *
 * @category Forms
 */
export function Checkbox({ size = 'md', tone = 'blue', className, ...rest }: CheckboxProps) {
  const classes = [
    'rounded border-stone-300',
    SIZE_CLASSES[size],
    TONE_CLASSES[tone],
    className ?? '',
  ]
    .filter(Boolean)
    .join(' ');

  return <input type="checkbox" className={classes} {...rest} />;
}
