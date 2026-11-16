import { useFormStatus } from 'react-dom';
import type { ReactNode } from 'react';
import { Button, type ButtonProps } from './Button';
import { Spinner } from './Spinner';

export interface SubmitButtonProps extends Omit<ButtonProps, 'type' | 'children'> {
  children: ReactNode;
  /** Shown instead of `children` while the form is submitting. */
  pendingLabel?: ReactNode;
  /**
   * Force the pending look for a form that is not driven by `action`
   * (an `onSubmit` handler), where `useFormStatus` stays false.
   */
  pending?: boolean;
}

/**
 * Submit button that knows its enclosing `<form action={…}>` is pending
 * (React 19 `useFormStatus`), so the form needs no `submitting` flag and no
 * prop drilling. While pending it disables itself, which also blocks Enter
 * from submitting twice, and shows a spinner.
 *
 * @category Actions
 */
export function SubmitButton({
  children,
  pendingLabel,
  pending: pendingOverride = false,
  disabled,
  variant = 'primary',
  ...rest
}: SubmitButtonProps) {
  const status = useFormStatus();
  const pending = status.pending || pendingOverride;

  return (
    <Button
      {...rest}
      variant={variant}
      type="submit"
      disabled={pending || disabled}
      aria-busy={pending || undefined}
    >
      {pending ? (
        <span className="inline-flex items-center gap-2">
          <Spinner tone={variant === 'primary' || variant === 'destructive' ? 'white' : 'gray'} />
          {pendingLabel ?? children}
        </span>
      ) : (
        children
      )}
    </Button>
  );
}
