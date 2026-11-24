import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { IconButton } from '../IconButton';

describe('IconButton', () => {
  it('exposes the label as the accessible name', () => {
    render(<IconButton label="Close" icon={<svg />} />);
    expect(screen.getByRole('button', { name: 'Close' })).toBeInTheDocument();
  });

  it('fires onClick', async () => {
    const onClick = vi.fn();
    render(<IconButton label="Delete" icon={<svg />} onClick={onClick} />);
    await userEvent.click(screen.getByRole('button', { name: 'Delete' }));
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('applies the danger variant classes', () => {
    render(<IconButton label="Delete" icon={<svg />} variant="danger" />);
    expect(screen.getByRole('button', { name: 'Delete' }).className).toContain(
      'hover:text-red-600',
    );
  });

  it('applies the subtle variant classes', () => {
    render(<IconButton label="Options" icon={<svg />} variant="subtle" />);
    expect(screen.getByRole('button', { name: 'Options' }).className).toContain(
      'hover:bg-stone-100',
    );
  });

  it('is a centered flex container so wrapped icons cannot inflate its height', () => {
    // An inline icon wrapper (e.g. .theme-toggle-icon) otherwise sits on the
    // text baseline and adds the font's descent to the button's line box.
    render(
      <IconButton
        label="Theme"
        icon={
          <span className="theme-toggle-icon">
            <svg />
          </span>
        }
      />,
    );
    const button = screen.getByRole('button', { name: 'Theme' });
    expect(button.className).toContain('flex');
    expect(button.className).toContain('items-center');
    expect(button.className).toContain('justify-center');
  });
});
