import { afterEach, describe, it, expect, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { ToolbarButton } from '#/features/documents/components/editor/EditorToolbarButton';

afterEach(() => {
  vi.unstubAllGlobals();
});

const stubPlatform = (platform: string) =>
  vi.spyOn(navigator, 'platform', 'get').mockReturnValue(platform);

describe('ToolbarButton', () => {
  it('is named by its label and runs its action', () => {
    const onClick = vi.fn();
    render(
      <ToolbarButton label="Bold" onClick={onClick}>
        B
      </ToolbarButton>,
    );

    const button = screen.getByRole('button', { name: 'Bold' });
    expect(button).toHaveAttribute('title', 'Bold');
    expect(button).not.toHaveAttribute('aria-pressed');
    expect(button).not.toHaveAttribute('aria-keyshortcuts');
    fireEvent.click(button);

    expect(onClick).toHaveBeenCalledOnce();
  });

  it('spells the shortcut the way a PC keyboard names it', () => {
    stubPlatform('Win32');
    render(
      <ToolbarButton label="Redo" shortcut="Mod-Shift-z" onClick={() => {}}>
        R
      </ToolbarButton>,
    );

    const button = screen.getByRole('button', { name: 'Redo' });
    expect(button).toHaveAttribute('title', 'Redo (Ctrl+Shift+Z)');
    expect(button).toHaveAttribute('aria-keyshortcuts', 'Control-Shift-z');
  });

  it('spells the shortcut with symbols on a Mac', () => {
    stubPlatform('MacIntel');
    render(
      <ToolbarButton label="Bold" shortcut="Mod-b" onClick={() => {}}>
        B
      </ToolbarButton>,
    );

    expect(screen.getByRole('button', { name: 'Bold' })).toHaveAttribute('title', 'Bold (⌘B)');
  });

  it('reads out the pressed state of a toggle', () => {
    const { rerender } = render(
      <ToolbarButton label="Bold" pressed={false} onClick={() => {}}>
        B
      </ToolbarButton>,
    );
    expect(screen.getByRole('button', { name: 'Bold' })).toHaveAttribute('aria-pressed', 'false');

    rerender(
      <ToolbarButton label="Bold" pressed onClick={() => {}}>
        B
      </ToolbarButton>,
    );
    const pressed = screen.getByRole('button', { name: 'Bold' });
    expect(pressed).toHaveAttribute('aria-pressed', 'true');
    expect(pressed).toHaveClass('bg-blue-100');
  });

  it('does not act while disabled', () => {
    const onClick = vi.fn();
    render(
      <ToolbarButton label="Bold" disabled onClick={onClick}>
        B
      </ToolbarButton>,
    );

    const button = screen.getByRole('button', { name: 'Bold' });
    expect(button).toBeDisabled();
    expect(button).toHaveClass('cursor-not-allowed');
    fireEvent.click(button);

    expect(onClick).not.toHaveBeenCalled();
  });
});
