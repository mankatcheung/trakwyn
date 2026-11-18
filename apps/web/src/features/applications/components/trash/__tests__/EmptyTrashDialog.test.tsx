import { describe, it, expect, vi } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import i18next from 'i18next';
import { EmptyTrashDialog } from '#/features/applications/components/trash/EmptyTrashDialog';

function setup(props: Partial<Parameters<typeof EmptyTrashDialog>[0]> = {}) {
  const handlers = { onCancel: vi.fn(), onConfirm: vi.fn() };
  const view = render(
    <EmptyTrashDialog open count={3} isPending={false} {...handlers} {...props} />,
  );
  return { ...handlers, ...view };
}

describe('EmptyTrashDialog', () => {
  it('renders nothing while closed', () => {
    setup({ open: false });

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('names how many applications it will delete', () => {
    setup({ count: 3 });

    expect(screen.getByText('Permanently delete all 3 applications?')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Delete all 3 forever' })).toBeInTheDocument();
    expect(screen.getByText(/It cannot be undone/)).toBeInTheDocument();
  });

  it('uses the singular for one application', () => {
    setup({ count: 1 });

    expect(screen.getByText('Permanently delete 1 application?')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Delete 1 forever' })).toBeInTheDocument();
  });

  it('confirms only from the delete button', () => {
    const { onCancel, onConfirm } = setup();

    fireEvent.click(screen.getByRole('button', { name: 'Delete all 3 forever' }));

    expect(onConfirm).toHaveBeenCalledOnce();
    expect(onCancel).not.toHaveBeenCalled();
  });

  it('cancels from the cancel button', () => {
    const { onCancel, onConfirm } = setup();

    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(onCancel).toHaveBeenCalledOnce();
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it('cancels on Escape', () => {
    const { onCancel } = setup();

    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });

    expect(onCancel).toHaveBeenCalledOnce();
  });

  it('puts Cancel first and focuses it, so a stray Enter dismisses', () => {
    setup();

    const buttons = screen.getAllByRole('button');
    expect(buttons[0]).toHaveAccessibleName('Cancel');
    expect(screen.getByRole('button', { name: 'Cancel' })).toHaveFocus();
  });

  it('follows the count, the pending state and the handlers as they change', () => {
    const first = setup({ count: 3 });
    first.rerender(
      <EmptyTrashDialog
        open
        count={3}
        isPending={false}
        onCancel={first.onCancel}
        onConfirm={first.onConfirm}
      />,
    );
    const nextConfirm = vi.fn();
    first.rerender(
      <EmptyTrashDialog
        open
        count={7}
        isPending
        onCancel={first.onCancel}
        onConfirm={nextConfirm}
      />,
    );

    expect(screen.getByRole('button', { name: 'Delete all 7 forever' })).toBeDisabled();

    first.rerender(
      <EmptyTrashDialog
        open
        count={7}
        isPending={false}
        onCancel={first.onCancel}
        onConfirm={nextConfirm}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Delete all 7 forever' }));
    expect(nextConfirm).toHaveBeenCalledOnce();
    expect(first.onConfirm).not.toHaveBeenCalled();
  });

  it('rewords itself when the language changes', async () => {
    setup();
    i18next.addResourceBundle('en-GB', 'translation', {
      'trash.emptyTrashConfirmBody': 'Gone at once. No undo.',
    });

    await act(async () => {
      await i18next.changeLanguage('en-GB');
    });
    expect(screen.getByText('Gone at once. No undo.')).toBeInTheDocument();

    await act(async () => {
      await i18next.changeLanguage('en');
    });
    expect(screen.getByText(/It cannot be undone/)).toBeInTheDocument();
  });

  it('locks both buttons while the delete is running', () => {
    setup({ isPending: true });

    expect(screen.getByRole('button', { name: 'Cancel' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Delete all 3 forever' })).toBeDisabled();
  });
});
