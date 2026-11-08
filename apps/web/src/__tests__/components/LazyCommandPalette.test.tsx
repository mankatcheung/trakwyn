import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

vi.mock('@tanstack/react-router', () => ({ useNavigate: () => vi.fn() }));

import { LazyCommandPalette } from '#/components/LazyCommandPalette';

describe('LazyCommandPalette', () => {
  it('renders nothing until the shortcut is pressed', () => {
    render(<LazyCommandPalette />);
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
  });

  it('ignores other key presses', async () => {
    render(<LazyCommandPalette />);
    await userEvent.keyboard('{Control>}k{/Control}');
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
  });

  it('loads the palette already open on the first shortcut press', async () => {
    render(<LazyCommandPalette />);
    await userEvent.keyboard('{Control>}{Shift>}k{/Shift}{/Control}');
    expect(await screen.findByRole('textbox')).toBeInTheDocument();
  });

  it('then toggles it closed with the same shortcut', async () => {
    render(<LazyCommandPalette />);
    await userEvent.keyboard('{Control>}{Shift>}k{/Shift}{/Control}');
    await screen.findByRole('textbox');

    await userEvent.keyboard('{Control>}{Shift>}k{/Shift}{/Control}');
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
  });
});
