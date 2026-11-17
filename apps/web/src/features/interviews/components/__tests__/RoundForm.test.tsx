import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { RoundForm } from '#/features/interviews/components/RoundForm';
import { emptyForm } from '#/features/interviews/lib/roundForm';

function renderForm(overrides: Partial<React.ComponentProps<typeof RoundForm>> = {}) {
  const onSave = vi.fn().mockResolvedValue(undefined);
  const onCancel = vi.fn();
  render(<RoundForm initial={emptyForm()} onSave={onSave} onCancel={onCancel} {...overrides} />);
  return { onSave, onCancel };
}

describe('RoundForm', () => {
  it('shows the initial values', () => {
    renderForm({
      initial: { ...emptyForm(), type: 'onsite', interviewerName: 'Alex Kim', notes: 'Bring ID' },
    });

    expect(screen.getByDisplayValue('Onsite')).toBeInTheDocument();
    expect(screen.getByDisplayValue('Alex Kim')).toBeInTheDocument();
    expect(screen.getByDisplayValue('Bring ID')).toBeInTheDocument();
  });

  it('offers every round type and outcome', () => {
    renderForm();

    for (const label of ['Phone', 'Technical', 'Onsite', 'HR', 'Other']) {
      expect(screen.getByRole('option', { name: label })).toBeInTheDocument();
    }
    for (const label of ['Pending', 'Passed', 'Failed', 'Cancelled']) {
      expect(screen.getByRole('option', { name: label })).toBeInTheDocument();
    }
  });

  it('hands what was typed to onSave', async () => {
    const { onSave } = renderForm();

    fireEvent.change(screen.getByPlaceholderText('Name or team'), { target: { value: 'Sam' } });
    fireEvent.change(screen.getByDisplayValue('Pending'), { target: { value: 'failed' } });
    fireEvent.click(screen.getByRole('button', { name: /^save$/i }));

    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
    expect(onSave.mock.calls[0][0]).toEqual({
      type: 'phone',
      scheduledAt: '',
      interviewerName: 'Sam',
      notes: '',
      outcome: 'failed',
    });
  });

  it('shows a rejected save under the form and keeps what was typed', async () => {
    renderForm({
      onSave: vi.fn().mockRejectedValue({
        response: {
          errors: [{ message: 'Round limit reached', extensions: { code: 'VALIDATION' } }],
        },
      }),
    });
    fireEvent.change(screen.getByPlaceholderText('Name or team'), { target: { value: 'Sam' } });

    fireEvent.click(screen.getByRole('button', { name: /^save$/i }));

    expect(await screen.findByText('Round limit reached')).toBeInTheDocument();
    expect(screen.getByDisplayValue('Sam')).toBeInTheDocument();
  });

  it('calls onCancel without saving', () => {
    const { onSave, onCancel } = renderForm();

    fireEvent.click(screen.getByRole('button', { name: /^cancel$/i }));

    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onSave).not.toHaveBeenCalled();
  });
});
