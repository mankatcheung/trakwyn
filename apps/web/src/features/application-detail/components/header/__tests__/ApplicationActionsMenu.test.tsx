import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ApplicationActionsMenu } from '#/features/application-detail/components/header/ApplicationActionsMenu';

const { mockNavigate } = vi.hoisted(() => ({ mockNavigate: vi.fn() }));

vi.mock('@tanstack/react-router', () => ({
  useNavigate: () => mockNavigate,
}));

function setup(overrides: Partial<Parameters<typeof ApplicationActionsMenu>[0]> = {}) {
  vi.clearAllMocks();
  const props = {
    applicationId: 'app-1',
    starred: false,
    status: 'applied',
    onToggleStar: vi.fn(),
    onChangeStatus: vi.fn(),
    onDelete: vi.fn(),
    ...overrides,
  };
  render(<ApplicationActionsMenu {...props} />);
  fireEvent.click(screen.getByRole('button', { name: 'More actions' }));
  return props;
}

describe('ApplicationActionsMenu', () => {
  it('lists the four actions once opened', () => {
    setup();

    const items = screen.getAllByRole('menuitem').map((i) => i.textContent);
    expect(items).toEqual(['Star', 'Edit', 'Change status', 'Delete application']);
  });

  it('stars the application', () => {
    const props = setup();

    fireEvent.click(screen.getByRole('menuitem', { name: 'Star' }));

    expect(props.onToggleStar).toHaveBeenCalledOnce();
  });

  it('offers Unstar for a starred application', () => {
    setup({ starred: true });

    expect(screen.getByRole('menuitem', { name: 'Unstar' })).toBeInTheDocument();
  });

  it('navigates to the edit page', () => {
    setup();

    fireEvent.click(screen.getByRole('menuitem', { name: 'Edit' }));

    expect(mockNavigate).toHaveBeenCalledExactlyOnceWith({
      to: '/applications/$applicationId/edit',
      params: { applicationId: 'app-1' },
    });
  });

  it('hands over to delete', () => {
    const props = setup();

    fireEvent.click(screen.getByRole('menuitem', { name: 'Delete application' }));

    expect(props.onDelete).toHaveBeenCalledOnce();
  });

  it('switches to the status pane in place, and back again', () => {
    setup();

    fireEvent.click(screen.getByRole('menuitem', { name: 'Change status' }));
    expect(screen.getByRole('menuitem', { name: 'Interviewing' })).toBeInTheDocument();
    expect(screen.queryByRole('menuitem', { name: 'Edit' })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('menuitem', { name: 'Change status' }));
    expect(screen.getByRole('menuitem', { name: 'Edit' })).toBeInTheDocument();
  });

  it('changes to a different status', () => {
    const props = setup({ status: 'applied' });

    fireEvent.click(screen.getByRole('menuitem', { name: 'Change status' }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Interviewing' }));

    expect(props.onChangeStatus).toHaveBeenCalledExactlyOnceWith('interviewing');
  });

  it('does not report the current status as a change', () => {
    const props = setup({ status: 'applied' });

    fireEvent.click(screen.getByRole('menuitem', { name: 'Change status' }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Applied' }));

    expect(props.onChangeStatus).not.toHaveBeenCalled();
  });
});
