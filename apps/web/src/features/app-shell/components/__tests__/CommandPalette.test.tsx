import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';

const { mockNavigate } = vi.hoisted(() => ({ mockNavigate: vi.fn() }));
vi.mock('@tanstack/react-router', () => ({ useNavigate: () => mockNavigate }));

import { CommandPalette } from '../CommandPalette';

const press = (init: KeyboardEventInit = {}) =>
  fireEvent.keyDown(window, { key: 'k', shiftKey: true, metaKey: true, ...init });
const input = () => screen.getByPlaceholderText('Type a command...');
const items = () => screen.getAllByRole('listitem');

describe('CommandPalette', () => {
  beforeEach(() => mockNavigate.mockReset());

  it('is closed until the shortcut is pressed', () => {
    render(<CommandPalette />);
    expect(screen.queryByPlaceholderText('Type a command...')).toBeNull();
    press();
    expect(input()).toBeInTheDocument();
  });

  it('opens straight away with initialOpen, focused and listing all six commands', () => {
    render(<CommandPalette initialOpen />);
    expect(input()).toHaveFocus();
    expect(items()).toHaveLength(6);
  });

  it('toggles on the shortcut with Ctrl as well as Cmd, and ignores other keys', () => {
    render(<CommandPalette />);
    press({ metaKey: false, ctrlKey: true });
    expect(input()).toBeInTheDocument();
    press({ metaKey: false, ctrlKey: true });
    expect(screen.queryByPlaceholderText('Type a command...')).toBeNull();
    press({ shiftKey: false });
    press({ key: 'j' });
    expect(screen.queryByPlaceholderText('Type a command...')).toBeNull();
  });

  it('filters by label, case-insensitively, and says when nothing matches', () => {
    render(<CommandPalette initialOpen />);
    fireEvent.change(input(), { target: { value: 'TRASH' } });
    expect(items()).toHaveLength(1);
    expect(items()[0]).toHaveTextContent('Trash');
    fireEvent.change(input(), { target: { value: 'zzz' } });
    expect(screen.getByText('No results')).toBeInTheDocument();
  });

  it('does nothing on Enter or arrows when nothing matches', () => {
    render(<CommandPalette initialOpen />);
    fireEvent.change(input(), { target: { value: 'zzz' } });
    fireEvent.keyDown(input(), { key: 'ArrowDown' });
    fireEvent.keyDown(input(), { key: 'Enter' });
    expect(mockNavigate).not.toHaveBeenCalled();
    expect(input()).toBeInTheDocument();
  });

  it('moves the selection with the arrows and wraps at both ends', () => {
    render(<CommandPalette initialOpen />);
    const selected = () => items().findIndex((li) => li.className.includes('bg-blue-50'));
    expect(selected()).toBe(0);
    fireEvent.keyDown(input(), { key: 'ArrowUp' });
    expect(selected()).toBe(5);
    fireEvent.keyDown(input(), { key: 'ArrowDown' });
    expect(selected()).toBe(0);
    fireEvent.keyDown(input(), { key: 'ArrowDown' });
    expect(selected()).toBe(1);
  });

  it('follows the mouse', () => {
    render(<CommandPalette initialOpen />);
    fireEvent.mouseEnter(items()[3]!);
    expect(items()[3]).toHaveClass('bg-blue-50');
  });

  it('runs the selected command on Enter and closes', () => {
    render(<CommandPalette initialOpen />);
    fireEvent.keyDown(input(), { key: 'ArrowDown' });
    fireEvent.keyDown(input(), { key: 'Enter' });
    expect(mockNavigate).toHaveBeenCalledWith({ to: '/applications' });
    expect(screen.queryByPlaceholderText('Type a command...')).toBeNull();
  });

  it('runs a clicked command and closes', () => {
    render(<CommandPalette initialOpen />);
    fireEvent.click(items()[3]!);
    expect(mockNavigate).toHaveBeenCalledWith({ to: '/applications/trash' });
    expect(screen.queryByPlaceholderText('Type a command...')).toBeNull();
  });

  it('navigates to every command target', () => {
    const targets: string[] = [];
    for (let i = 0; i < 6; i++) {
      const { unmount } = render(<CommandPalette initialOpen />);
      fireEvent.click(items()[i]!);
      targets.push(mockNavigate.mock.calls[i]![0].to);
      unmount();
    }
    expect(targets).toEqual([
      '/dashboard',
      '/applications',
      '/applications/new',
      '/applications/trash',
      '/analytics',
      '/account',
    ]);
  });

  it('shows the shortcut hint on New application only', () => {
    render(<CommandPalette initialOpen />);
    expect(screen.getAllByText('⌘N')).toHaveLength(1);
  });

  it('closes on Escape and on a backdrop click', () => {
    const { container, rerender } = render(<CommandPalette initialOpen />);
    fireEvent.keyDown(input(), { key: 'Escape' });
    expect(screen.queryByPlaceholderText('Type a command...')).toBeNull();
    press();
    fireEvent.click(container.querySelector('.bg-black\\/50')!);
    expect(screen.queryByPlaceholderText('Type a command...')).toBeNull();
    rerender(<CommandPalette />);
  });

  it('clears the query and selection when reopened', () => {
    render(<CommandPalette initialOpen />);
    fireEvent.change(input(), { target: { value: 'tra' } });
    press();
    press();
    expect(input()).toHaveValue('');
    expect(items()).toHaveLength(6);
  });
});
