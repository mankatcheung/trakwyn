import { useActionState } from 'react';
import type { FieldValues, UseFormReturn } from 'react-hook-form';

export interface FormActionState {
  /** The message to show under the form, or null after a clean submit. */
  error: string | null;
  /** The API error code behind `error`, when `submit` returned one (e.g. `PLAN_REQUIRED`). */
  code?: string;
}

/** What `submit` may return: a message, a message with its code, or nothing for success. */
export type FormActionResult = string | { message: string; code?: string } | null | void;

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
 * to show (a plain string, or `{ message, code }` when the form must tell
 * one kind of error from another), or null/undefined on success. Pending state is not returned: read
 * it with `useFormStatus` (the `SubmitButton` from `@trakwyn/ui` does).
 *
 * React resets a form's DOM fields once its action settles. These inputs are
 * registered with react-hook-form, which would keep the old values while the
 * DOM went blank, so the reset is cancelled and the form decides itself when
 * to clear (`form.reset(...)` in `submit`).
 */
export function useFormAction<TIn extends FieldValues, TOut extends FieldValues = TIn>(
  // The context type is the form's own business, so any is right here.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  form: UseFormReturn<TIn, any, TOut>,
  submit: (data: TOut) => Promise<FormActionResult>,
) {
  const [state, action] = useActionState(async (): Promise<FormActionState> => {
    const outcome: { value: Exclude<FormActionResult, void> } = { value: null };
    await form.handleSubmit(async (data) => {
      outcome.value = (await submit(data)) ?? null;
    })();
    const result = outcome.value;
    if (!result) return IDLE;
    return typeof result === 'string'
      ? { error: result }
      : { error: result.message, code: result.code };
  }, IDLE);

  return { state, formProps: { action, ref: keepFieldsAfterAction } };
}
