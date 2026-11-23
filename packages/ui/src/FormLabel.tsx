import type { LabelHTMLAttributes } from 'react';

export type FormLabelSize = 'sm' | 'xs';

const SIZE_CLASSES: Record<FormLabelSize, string> = {
  sm: 'text-sm font-medium text-stone-700 dark:text-stone-300',
  xs: 'text-xs font-medium text-stone-500',
};

export interface FormLabelProps extends LabelHTMLAttributes<HTMLLabelElement> {
  size?: FormLabelSize;
}

/**
 * Label for a form field. `size="sm"` (default) is the standard full-page
 * form label; `size="xs"` is the compact variant used in denser panel
 * forms (no dark-mode color variant, matching every existing use of it).
 *
 * @category Forms
 */
export function FormLabel({ size = 'sm', className, children, ...rest }: FormLabelProps) {
  const classes = ['block mb-1', SIZE_CLASSES[size], className ?? ''].filter(Boolean).join(' ');

  return (
    <label className={classes} {...rest}>
      {children}
    </label>
  );
}
