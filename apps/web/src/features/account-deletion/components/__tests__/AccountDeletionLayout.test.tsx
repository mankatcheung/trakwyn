import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { AccountDeletionLayout } from '#/features/account-deletion/components/AccountDeletionLayout';

describe('AccountDeletionLayout', () => {
  it('shows the brand, the page title and the page inside the main landmark', () => {
    render(
      <AccountDeletionLayout title="Confirm deletion">
        <button type="button">Delete my account</button>
      </AccountDeletionLayout>,
    );

    const main = screen.getByRole('main');
    expect(main).toHaveTextContent('Trakwyn');
    expect(screen.getByRole('heading', { level: 1, name: 'Confirm deletion' })).toBeInTheDocument();
    expect(main).toContainElement(screen.getByRole('button', { name: 'Delete my account' }));
  });

  it('changes the title alone, or the page alone', () => {
    const body = <p>Same page</p>;
    const { rerender } = render(<AccountDeletionLayout title="One">{body}</AccountDeletionLayout>);

    rerender(<AccountDeletionLayout title="Two">{body}</AccountDeletionLayout>);
    expect(screen.getByRole('heading', { name: 'Two' })).toBeInTheDocument();
    expect(screen.getByText('Same page')).toBeInTheDocument();

    rerender(
      <AccountDeletionLayout title="Two">
        <p>New page</p>
      </AccountDeletionLayout>,
    );
    expect(screen.getByRole('heading', { name: 'Two' })).toBeInTheDocument();
    expect(screen.getByText('New page')).toBeInTheDocument();
  });

  it('follows the title and the children as they change', () => {
    const { rerender } = render(
      <AccountDeletionLayout title="Confirm deletion">
        <p>First</p>
      </AccountDeletionLayout>,
    );
    rerender(
      <AccountDeletionLayout title="Confirm deletion">
        <p>First</p>
      </AccountDeletionLayout>,
    );
    expect(screen.getByText('First')).toBeInTheDocument();

    rerender(
      <AccountDeletionLayout title="Deletion cancelled">
        <p>Second</p>
      </AccountDeletionLayout>,
    );

    expect(screen.getByRole('heading', { name: 'Deletion cancelled' })).toBeInTheDocument();
    expect(screen.getByText('Second')).toBeInTheDocument();
    expect(screen.queryByText('First')).not.toBeInTheDocument();
  });
});
