import { useActionState, useState } from 'react';
import type { DefaultValues, FieldValues, UseFormReturn } from 'react-hook-form';

export interface FormActionState {
  /** The message to show under the form, or null after a clean submit. */
  error: string | null;
  /** The API error code behind `error`, when `submit` returned one (e.g. `PLAN_REQUIRED`). */
  code?: string;
}

/** What `submit` may return: a message, a message with its code, or nothing for success. */
export type FormActionResult = string | { message: string; code?: string } | null | void;

const IDLE: FormActionState = { error: null };

/** What `submit` gets besides the validated data. */
export interface FormActionHelpers<T extends FieldValues> {
  /**
   * Empties the form after a successful save: resets react-hook-form to
   * `values` and the DOM fields with it. `form.reset(values)` alone leaves the
   * DOM as it was, because the native reset it relies on is cancelled below.
   */
  resetFields: (values?: DefaultValues<T>) => void;
}

/**
 * The `<form>` ref that cancels React's own reset, and a way to let one
 * deliberate reset through. The listener has to be native and the ref never
 * change: React calls `form.reset()` while it commits the action's result, it
 * does not dispatch `onReset` for that, and a ref callback re-created each
 * render is detached just before the reset runs.
 */
function createFormGuard() {
  const guard: { form: HTMLFormElement | null; allowReset: boolean } = {
    form: null,
    allowReset: false,
  };
  const cancelReset = (event: Event) => {
    if (!guard.allowReset) event.preventDefault();
  };
  return {
    keepFields(form: HTMLFormElement | null) {
      guard.form = form;
      if (!form) return;
      form.addEventListener('reset', cancelReset);
      return () => form.removeEventListener('reset', cancelReset);
    },
    resetDom() {
      guard.allowReset = true;
      try {
        guard.form?.reset();
      } finally {
        guard.allowReset = false;
      }
    },
  };
}

/**
 * Props that make a react-hook-form form a React 19 form action (JEF-612).
 *
 * `submit` runs only when the schema validates and returns an error message
 * to show (a plain string, or `{ message, code }` when the form must tell
 * one kind of error from another), or null/undefined on success. Pending state is not returned: read
 * it with `useFormStatus` (the `SubmitButton` from `@trakwyn/ui` does).
 *
 * React resets a form's DOM fields once its action settles. These inputs are
 * registered with react-hook-form, which would keep the old values while the
 * DOM went blank, so the reset is cancelled and the form decides itself when
 * to clear (`resetFields(...)`, passed to `submit`).
 */
export function useFormAction<T extends FieldValues>(
  form: UseFormReturn<T>,
  submit: (data: T, helpers: FormActionHelpers<T>) => Promise<FormActionResult>,
) {
  // Created once per form, so React never detaches and re-attaches the listener.
  const [guard] = useState(createFormGuard);

  const [state, action] = useActionState(async (): Promise<FormActionState> => {
    const outcome: { value: Exclude<FormActionResult, void> } = { value: null };
    await form.handleSubmit(async (data) => {
      const resetFields = (values?: DefaultValues<T>) => {
        form.reset(values);
        guard.resetDom();
      };
      outcome.value = (await submit(data, { resetFields })) ?? null;
    })();
    const result = outcome.value;
    if (!result) return IDLE;
    return typeof result === 'string'
      ? { error: result }
      : { error: result.message, code: result.code };
  }, IDLE);

  return { state, formProps: { action, ref: guard.keepFields } };
}
