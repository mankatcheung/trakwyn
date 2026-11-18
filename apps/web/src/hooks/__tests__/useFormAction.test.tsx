import { describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useFormAction, type FormActionResult } from '#/hooks/useFormAction';

const schema = z.object({ title: z.string().min(1, 'Enter a title') });
type Values = z.infer<typeof schema>;
type Submit = Parameters<typeof useFormAction<Values>>[1];

function Harness({ submit, onValues }: { submit: Submit; onValues?: (v: Values) => void }) {
  const form = useForm<Values>({ resolver: zodResolver(schema), defaultValues: { title: '' } });
  const { state, formProps } = useFormAction(form, submit);
  return (
    <form {...formProps} aria-label="harness">
      <input aria-label="title" {...form.register('title')} />
      {form.formState.errors.title && <p role="alert">{form.formState.errors.title.message}</p>}
      {state.error && <p data-testid="error">{state.error}</p>}
      {state.code && <p data-testid="code">{state.code}</p>}
      <button type="submit">Save</button>
      <button type="button" onClick={() => onValues?.(form.getValues())}>
        Read
      </button>
    </form>
  );
}

const input = () => screen.getByLabelText('title') as HTMLInputElement;

describe('useFormAction (JEF-612)', () => {
  it('does not call submit while the schema fails, and shows the field error', async () => {
    const submit = vi.fn<Submit>().mockResolvedValue(null);
    render(<Harness submit={submit} />);
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Enter a title');
    expect(submit).not.toHaveBeenCalled();
  });

  it('passes the validated data to submit', async () => {
    const submit = vi.fn<Submit>().mockResolvedValue(null);
    render(<Harness submit={submit} />);
    await userEvent.type(input(), 'Hello');
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(submit).toHaveBeenCalledTimes(1));
    expect(submit.mock.calls[0][0]).toEqual({ title: 'Hello' });
  });

  it('keeps what was typed, in the DOM and in the form, after a failed submit', async () => {
    const submit = vi.fn<Submit>().mockResolvedValue('Could not save');
    let read: Values | undefined;
    render(<Harness submit={submit} onValues={(v) => (read = v)} />);
    await userEvent.type(input(), 'Keep me');
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(await screen.findByTestId('error')).toHaveTextContent('Could not save');
    expect(input().value).toBe('Keep me');
    await userEvent.click(screen.getByRole('button', { name: 'Read' }));
    expect(read).toEqual({ title: 'Keep me' });
  });

  it('keeps what was typed after a successful submit that does not reset', async () => {
    const submit = vi.fn<Submit>().mockResolvedValue(null);
    render(<Harness submit={submit} />);
    await userEvent.type(input(), 'Still here');
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(submit).toHaveBeenCalled());
    expect(input().value).toBe('Still here');
  });

  it('clears the DOM field and the form when submit calls resetFields', async () => {
    const submit = vi.fn<Submit>().mockImplementation(async (_data, { resetFields }) => {
      resetFields({ title: '' });
      return null;
    });
    let read: Values | undefined;
    render(<Harness submit={submit} onValues={(v) => (read = v)} />);
    await userEvent.type(input(), 'Gone soon');
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(input().value).toBe(''));
    await userEvent.click(screen.getByRole('button', { name: 'Read' }));
    expect(read).toEqual({ title: '' });
  });

  it('turns a { message, code } result into error and code', async () => {
    const result: FormActionResult = { message: 'Upgrade needed', code: 'PLAN_REQUIRED' };
    const submit = vi.fn<Submit>().mockResolvedValue(result);
    render(<Harness submit={submit} />);
    await userEvent.type(input(), 'x');
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(await screen.findByTestId('error')).toHaveTextContent('Upgrade needed');
    expect(screen.getByTestId('code')).toHaveTextContent('PLAN_REQUIRED');
  });

  it('clears the previous error after a clean submit', async () => {
    const submit = vi.fn<Submit>().mockResolvedValueOnce('Nope').mockResolvedValueOnce(undefined);
    render(<Harness submit={submit} />);
    await userEvent.type(input(), 'x');
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    await screen.findByTestId('error');
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(screen.queryByTestId('error')).not.toBeInTheDocument());
  });
});
