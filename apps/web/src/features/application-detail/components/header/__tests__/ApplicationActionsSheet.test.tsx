import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import type { ReactNode } from 'react';
import { ApplicationActionsSheet } from '#/features/application-detail/components/header/ApplicationActionsSheet';

vi.mock('@tanstack/react-router', () => ({
  Link: ({ children, to, onClick }: { children: ReactNode; to: string; onClick?: () => void }) => (
    <a href={to} onClick={onClick}>
      {children}
    </a>
  ),
}));

function setup(overrides: Partial<Parameters<typeof ApplicationActionsSheet>[0]> = {}) {
  const props = {
    open: true,
    onClose: vi.fn(),
    applicationId: 'app-1',
    starred: false,
    status: 'applied',
    onToggleStar: vi.fn(),
    onChangeStatus: vi.fn(),
    onDelete: vi.fn(),
    ...overrides,
  };
  const view = render(<ApplicationActionsSheet {...props} />);
  return { props, ...view };
}

describe('ApplicationActionsSheet', () => {
  it('renders nothing while closed', () => {
    setup({ open: false });

    expect(screen.queryByRole('button', { name: /Star/ })).not.toBeInTheDocument();
  });

  it('stars the application and closes', () => {
    const { props } = setup();

    fireEvent.click(screen.getByRole('button', { name: 'Star' }));

    expect(props.onToggleStar).toHaveBeenCalledOnce();
    expect(props.onClose).toHaveBeenCalledOnce();
  });

  it('offers Unstar for a starred application', () => {
    setup({ starred: true });

    expect(screen.getByRole('button', { name: 'Unstar' })).toBeInTheDocument();
  });

  it('links to the edit page and closes when followed', () => {
    const { props } = setup();

    const edit = screen.getByRole('link', { name: 'Edit' });
    expect(edit).toHaveAttribute('href', '/applications/$applicationId/edit');
    fireEvent.click(edit);

    expect(props.onClose).toHaveBeenCalledOnce();
  });

  it('closes before it hands over to delete', () => {
    const order: string[] = [];
    const { props } = setup({
      onClose: vi.fn(() => order.push('close')),
      onDelete: vi.fn(() => order.push('delete')),
    });

    fireEvent.click(screen.getByRole('button', { name: 'Delete application' }));

    expect(props.onDelete).toHaveBeenCalledOnce();
    expect(order).toEqual(['close', 'delete']);
  });

  it('shows the current status on the Change status row', () => {
    setup({ status: 'applied' });

    expect(screen.getByRole('button', { name: /Change status/ })).toHaveTextContent('Applied');
  });

  it('opens the status pane and picks a different status', () => {
    const { props } = setup({ status: 'applied' });

    fireEvent.click(screen.getByRole('button', { name: /Change status/ }));
    expect(screen.getByRole('button', { name: 'Applied' })).toHaveAttribute('aria-current', 'true');
    fireEvent.click(screen.getByRole('button', { name: 'Interviewing' }));

    expect(props.onChangeStatus).toHaveBeenCalledExactlyOnceWith('interviewing');
    expect(props.onClose).toHaveBeenCalledOnce();
  });

  it('closes without a change when the current status is picked again', () => {
    const { props } = setup({ status: 'applied' });

    fireEvent.click(screen.getByRole('button', { name: /Change status/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Applied' }));

    expect(props.onChangeStatus).not.toHaveBeenCalled();
    expect(props.onClose).toHaveBeenCalledOnce();
  });

  it('returns to the actions pane when reopened', () => {
    const { rerender, props } = setup();

    fireEvent.click(screen.getByRole('button', { name: /Change status/ }));
    rerender(<ApplicationActionsSheet {...props} open={false} />);
    rerender(<ApplicationActionsSheet {...props} open />);

    expect(screen.getByRole('button', { name: 'Star' })).toBeInTheDocument();
  });
});
