import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { OfferForm } from '#/routes/_authenticated/applications/$applicationId/-components/OfferForm';

function fieldFor(labelText: string | RegExp): HTMLElement {
  const label = screen.getByText(labelText);
  const field = label.parentElement?.querySelector('input, select, textarea');
  if (!field) throw new Error(`No field found for label ${String(labelText)}`);
  return field as HTMLElement;
}

describe('OfferForm', () => {
  it('renders with default values when no initialData is given', () => {
    render(<OfferForm onSubmit={vi.fn()} onCancel={vi.fn()} />);

    expect(fieldFor('Base Salary *')).toHaveValue(0);
    expect(fieldFor('Currency')).toHaveValue('USD');
    expect(fieldFor('Period')).toHaveValue('yearly');
  });

  it('renders pre-filled fields from initialData', () => {
    render(
      <OfferForm
        initialData={{
          baseSalary: 150000,
          bonus: 10000,
          equity: '1000 RSUs over 4 years',
          benefits: 'Health insurance',
          costOfLivingAdjustment: 5,
          currency: 'EUR',
          period: 'monthly',
          notes: 'Great team',
        }}
        onSubmit={vi.fn()}
        onCancel={vi.fn()}
      />,
    );

    expect(fieldFor('Base Salary *')).toHaveValue(150000);
    expect(fieldFor('Bonus')).toHaveValue(10000);
    expect(fieldFor('Currency')).toHaveValue('EUR');
    expect(fieldFor('Period')).toHaveValue('monthly');
    expect(screen.getByDisplayValue('1000 RSUs over 4 years')).toBeInTheDocument();
    expect(screen.getByDisplayValue('Health insurance')).toBeInTheDocument();
    expect(screen.getByDisplayValue('Great team')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /save offer/i })).not.toBeDisabled();
  });

  it('updates fields on change', () => {
    render(<OfferForm onSubmit={vi.fn()} onCancel={vi.fn()} />);

    fireEvent.change(fieldFor('Base Salary *'), { target: { value: '120000' } });
    expect(fieldFor('Base Salary *')).toHaveValue(120000);
  });

  it('calls onSubmit with numbers parsed from the fields', async () => {
    const onSubmit = vi.fn();
    render(<OfferForm onSubmit={onSubmit} onCancel={vi.fn()} />);

    fireEvent.change(fieldFor('Base Salary *'), { target: { value: '120000' } });
    fireEvent.change(fieldFor('Bonus'), { target: { value: '5000' } });
    fireEvent.click(screen.getByRole('button', { name: /save offer/i }));

    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({
        baseSalary: 120000,
        bonus: 5000,
        costOfLivingAdjustment: null,
        currency: 'USD',
        period: 'yearly',
      }),
    );
  });

  it('keeps a blank bonus and cost-of-living adjustment as null', async () => {
    const onSubmit = vi.fn();
    render(
      <OfferForm
        initialData={{ baseSalary: 90000, bonus: 1000, costOfLivingAdjustment: 3 }}
        onSubmit={onSubmit}
        onCancel={vi.fn()}
      />,
    );

    fireEvent.change(fieldFor('Bonus'), { target: { value: '' } });
    fireEvent.change(fieldFor('Cost of Living Adjustment (%)'), { target: { value: '' } });
    fireEvent.click(screen.getByRole('button', { name: /save offer/i }));

    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({ baseSalary: 90000, bonus: null, costOfLivingAdjustment: null }),
    );
  });

  it('calls onCancel when Cancel is clicked', () => {
    const onCancel = vi.fn();
    render(<OfferForm onSubmit={vi.fn()} onCancel={onCancel} />);

    fireEvent.click(screen.getByRole('button', { name: /cancel/i }));
    expect(onCancel).toHaveBeenCalled();
  });

  it('does not submit a base salary of 0 and says why', async () => {
    const onSubmit = vi.fn();
    render(<OfferForm onSubmit={onSubmit} onCancel={vi.fn()} />);

    fireEvent.click(screen.getByRole('button', { name: /save offer/i }));

    expect(await screen.findByText('Must be greater than 0')).toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('does not submit a blank base salary', async () => {
    const onSubmit = vi.fn();
    render(<OfferForm onSubmit={onSubmit} onCancel={vi.fn()} />);

    fireEvent.change(fieldFor('Base Salary *'), { target: { value: '' } });
    fireEvent.click(screen.getByRole('button', { name: /save offer/i }));

    expect(await screen.findByText('Enter a base salary')).toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('does not submit a negative bonus', async () => {
    const onSubmit = vi.fn();
    render(<OfferForm initialData={{ baseSalary: 1 }} onSubmit={onSubmit} onCancel={vi.fn()} />);

    fireEvent.change(fieldFor('Bonus'), { target: { value: '-5' } });
    fireEvent.click(screen.getByRole('button', { name: /save offer/i }));

    expect(await screen.findByText('Must be 0 or more')).toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('keeps what was typed when the parent fails to save', async () => {
    // The parent shows its own error and resolves; the form must not clear.
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    render(
      <OfferForm initialData={{ baseSalary: 100000 }} onSubmit={onSubmit} onCancel={vi.fn()} />,
    );

    fireEvent.change(fieldFor('Bonus'), { target: { value: '2500' } });
    fireEvent.change(screen.getByPlaceholderText(/RSU/i), { target: { value: '500 RSUs' } });
    fireEvent.click(screen.getByRole('button', { name: /save offer/i }));

    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    expect(fieldFor('Bonus')).toHaveValue(2500);
    expect(screen.getByDisplayValue('500 RSUs')).toBeInTheDocument();
  });

  it('submits once when the button is double clicked', async () => {
    let finish: () => void = () => {};
    const onSubmit = vi.fn(() => new Promise<void>((resolve) => (finish = resolve)));
    render(
      <OfferForm initialData={{ baseSalary: 100000 }} onSubmit={onSubmit} onCancel={vi.fn()} />,
    );

    const save = screen.getByRole('button', { name: /save offer/i });
    fireEvent.click(save);
    fireEvent.click(save);

    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    expect(screen.getByRole('button', { name: /saving/i })).toBeDisabled();
    finish();
    await waitFor(() => expect(screen.getByRole('button', { name: /save offer/i })).toBeEnabled());
    expect(onSubmit).toHaveBeenCalledTimes(1);
  });

  it('shows "Saving…" and disables submit when loading', () => {
    render(
      <OfferForm
        initialData={{ baseSalary: 100000 }}
        onSubmit={vi.fn()}
        onCancel={vi.fn()}
        loading
      />,
    );

    const button = screen.getByRole('button', { name: /saving/i });
    expect(button).toBeInTheDocument();
    expect(button).toBeDisabled();
  });
});
