import { useActionState } from 'react';
import type { FieldValues, UseFormReturn } from 'react-hook-form';

export interface FormActionState {
  /** The message to show under the form, or null after a clean submit. */
  error: string | null;
}

const IDLE: FormActionState = { error: null };

const cancelReset = (event: Event) => event.preventDefault();

/**
 * Ref for the `<form>` that cancels React's own reset. It has to be a native
 * listener on a ref that never changes: React calls `form.reset()` while it
 * commits the action's result, it does not dispatch `onReset` for that, and a
 * ref callback re-created each render is detached just before the reset runs.
 */
function keepFieldsAfterAction(form: HTMLFormElement | null) {
  if (!form) return;
  form.addEventListener('reset', cancelReset);
  return () => form.removeEventListener('reset', cancelReset);
}

/**
 * Props that make a react-hook-form form a React 19 form action (JEF-612).
 *
 * `submit` runs only when the schema validates and returns an error message
 * to show, or null/undefined on success. Pending state is not returned: read
 * it with `useFormStatus` (the `SubmitButton` from `@trakwyn/ui` does).
 *
 * React resets a form's DOM fields once its action settles. These inputs are
 * registered with react-hook-form, which would keep the old values while the
 * DOM went blank, so the reset is cancelled and the form decides itself when
 * to clear (`form.reset(...)` in `submit`).
 */
export function useFormAction<T extends FieldValues>(
  form: UseFormReturn<T>,
  submit: (data: T) => Promise<string | null | void>,
) {
  const [state, action] = useActionState(async (): Promise<FormActionState> => {
    let error: string | null = null;
    await form.handleSubmit(async (data) => {
      error = (await submit(data)) ?? null;
    })();
    return error === null ? IDLE : { error };
  }, IDLE);

  return { state, formProps: { action, ref: keepFieldsAfterAction } };
}
