import { describe, it, expect, vi } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import i18next from 'i18next';
import { PasswordField } from '#/features/auth/components/PasswordField';

describe('PasswordField', () => {
  it('hides what is typed until asked', () => {
    render(<PasswordField aria-label="Password" />);

    expect(screen.getByLabelText('Password')).toHaveAttribute('type', 'password');
    expect(screen.getByRole('button', { name: 'Show password' })).toHaveAttribute(
      'aria-pressed',
      'false',
    );
  });

  it('shows and hides it from the toggle without losing the text', () => {
    render(<PasswordField aria-label="Password" defaultValue="hunter2" />);

    fireEvent.click(screen.getByRole('button', { name: 'Show password' }));
    expect(screen.getByLabelText('Password')).toHaveAttribute('type', 'text');
    expect(screen.getByLabelText('Password')).toHaveValue('hunter2');
    expect(screen.getByRole('button', { name: 'Hide password' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );

    fireEvent.click(screen.getByRole('button', { name: 'Hide password' }));
    expect(screen.getByLabelText('Password')).toHaveAttribute('type', 'password');
    expect(screen.getByLabelText('Password')).toHaveValue('hunter2');
  });

  it('relabels the toggle when the language changes', async () => {
    render(<PasswordField aria-label="Password" />);
    i18next.addResourceBundle('en-GB', 'translation', {
      'registerPage.showPassword': 'Reveal password',
    });

    await act(async () => {
      await i18next.changeLanguage('en-GB');
    });
    expect(screen.getByRole('button', { name: 'Reveal password' })).toBeInTheDocument();

    await act(async () => {
      await i18next.changeLanguage('en');
    });
    expect(screen.getByRole('button', { name: 'Show password' })).toBeInTheDocument();
  });

  it('follows its props as they change, keeping the visibility choice', () => {
    const { rerender } = render(<PasswordField aria-label="Password" placeholder="one" />);
    fireEvent.click(screen.getByRole('button', { name: 'Show password' }));

    rerender(<PasswordField aria-label="Password" placeholder="two" />);

    expect(screen.getByLabelText('Password')).toHaveAttribute('placeholder', 'two');
    expect(screen.getByLabelText('Password')).toHaveAttribute('type', 'text');
  });

  it('does not submit a form when the toggle is pressed', () => {
    const onSubmit = vi.fn((e: { preventDefault: () => void }) => e.preventDefault());
    render(
      <form onSubmit={onSubmit}>
        <PasswordField aria-label="Password" />
      </form>,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Show password' }));

    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('passes the rest of its props to the input, but not its own type', () => {
    const onChange = vi.fn();
    render(
      <PasswordField
        aria-label="Password"
        name="password"
        placeholder="At least 8"
        autoComplete="new-password"
        onChange={onChange}
        {...({ type: 'text' } as object)}
      />,
    );

    const input = screen.getByLabelText('Password');
    expect(input).toHaveAttribute('name', 'password');
    expect(input).toHaveAttribute('placeholder', 'At least 8');
    expect(input).toHaveAttribute('autocomplete', 'new-password');
    expect(input).toHaveAttribute('type', 'password');
    fireEvent.change(input, { target: { value: 'x' } });
    expect(onChange).toHaveBeenCalledOnce();
  });
});
