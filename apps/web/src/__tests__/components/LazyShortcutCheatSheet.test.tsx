import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { LazyShortcutCheatSheet } from '#/components/LazyShortcutCheatSheet';

describe('LazyShortcutCheatSheet', () => {
  it('renders nothing while it has never been opened', () => {
    render(<LazyShortcutCheatSheet isOpen={false} onClose={vi.fn()} />);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('loads and shows the cheat sheet once opened', async () => {
    const { rerender } = render(<LazyShortcutCheatSheet isOpen={false} onClose={vi.fn()} />);
    rerender(<LazyShortcutCheatSheet isOpen onClose={vi.fn()} />);
    expect(await screen.findByRole('dialog', { name: 'Keyboard Shortcuts' })).toBeInTheDocument();
  });

  it('closes again after it has loaded', async () => {
    const { rerender } = render(<LazyShortcutCheatSheet isOpen onClose={vi.fn()} />);
    await screen.findByRole('dialog');
    rerender(<LazyShortcutCheatSheet isOpen={false} onClose={vi.fn()} />);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});
