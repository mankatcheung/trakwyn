import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SubmitButton } from '../SubmitButton';

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

describe('SubmitButton', () => {
  it('is a submit button that is idle outside a pending form', () => {
    render(
      <form>
        <SubmitButton>Save</SubmitButton>
      </form>,
    );
    const button = screen.getByRole('button', { name: 'Save' });
    expect(button).toHaveAttribute('type', 'submit');
    expect(button).toBeEnabled();
    expect(button).not.toHaveAttribute('aria-busy');
  });

  it('disables itself and shows the pending label while the form action runs', async () => {
    const gate = deferred();
    const action = vi.fn(() => gate.promise);
    const user = userEvent.setup();
    render(
      <form action={action}>
        <SubmitButton pendingLabel="Saving…">Save</SubmitButton>
      </form>,
    );

    await user.click(screen.getByRole('button', { name: 'Save' }));

    const busy = await screen.findByRole('button', { name: 'Saving…' });
    expect(busy).toBeDisabled();
    expect(busy).toHaveAttribute('aria-busy', 'true');

    gate.resolve();
    await waitFor(() => expect(screen.getByRole('button', { name: 'Save' })).toBeEnabled());
  });

  it('cannot submit twice on a double click', async () => {
    const gate = deferred();
    const action = vi.fn(() => gate.promise);
    const user = userEvent.setup();
    render(
      <form action={action}>
        <SubmitButton pendingLabel="Saving…">Save</SubmitButton>
      </form>,
    );

    await user.dblClick(screen.getByRole('button', { name: 'Save' }));
    gate.resolve();

    await waitFor(() => expect(screen.getByRole('button', { name: 'Save' })).toBeEnabled());
    expect(action).toHaveBeenCalledTimes(1);
  });

  it('keeps the children as the label when no pendingLabel is given', () => {
    render(<SubmitButton pending>Save</SubmitButton>);
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled();
  });

  it('shows the pending look for an onSubmit form through the pending prop', () => {
    render(
      <SubmitButton pending pendingLabel="Saving…">
        Save
      </SubmitButton>,
    );
    expect(screen.getByRole('button', { name: 'Saving…' })).toBeDisabled();
  });

  it('stays disabled when disabled is passed and nothing is pending', () => {
    render(<SubmitButton disabled>Save</SubmitButton>);
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled();
  });
});
