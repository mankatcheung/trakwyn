import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';

const { mockGqlRequest, mockNavigate, mockSearch, mockClear, mockInvalidate } = vi.hoisted(() => ({
  mockGqlRequest: vi.fn(),
  mockNavigate: vi.fn(),
  mockSearch: vi.fn(),
  mockClear: vi.fn(),
  mockInvalidate: vi.fn(),
}));

vi.mock('#/graphql/client', () => ({ gqlClient: { request: mockGqlRequest } }));
vi.mock('#/lib/queryClient', () => ({
  queryClient: { clear: mockClear, invalidateQueries: mockInvalidate },
}));
vi.mock('@tanstack/react-router', () => ({
  useNavigate: () => mockNavigate,
  useSearch: () => mockSearch(),
  Link: ({ children, to }: { children: ReactNode; to: string }) => <a href={to}>{children}</a>,
}));

import { ConfirmAccountDeletionPage } from '#/routes/-components/ConfirmAccountDeletionPage';
import { CancelAccountDeletionPage } from '#/routes/-components/CancelAccountDeletionPage';
import { AccountDeletionScheduledPage } from '#/routes/-components/AccountDeletionScheduledPage';

const DATE = '2026-11-12T12:00:00.000Z';
const refusal = (message: string) =>
  Object.assign(new Error(message), { response: { errors: [{ message }] } });

beforeEach(() => vi.clearAllMocks());

describe('ConfirmAccountDeletionPage (JEF-463)', () => {
  it('does nothing until the button is pressed, so a mail scanner cannot confirm', async () => {
    mockSearch.mockReturnValue({ token: 'raw' });
    render(<ConfirmAccountDeletionPage />);

    expect(screen.getByText('Delete your account?')).toBeInTheDocument();
    expect(mockGqlRequest).not.toHaveBeenCalled();
  });

  it('schedules the deletion, shows the date and clears cached data', async () => {
    mockSearch.mockReturnValue({ token: 'raw' });
    mockGqlRequest.mockResolvedValue({ confirmAccountDeletion: DATE });
    render(<ConfirmAccountDeletionPage />);

    await userEvent.click(screen.getByRole('button', { name: 'Delete my account' }));

    expect(await screen.findByText('Your account will be deleted')).toBeInTheDocument();
    expect(screen.getByText(/permanently deleted on .*2026/)).toBeInTheDocument();
    expect(mockGqlRequest).toHaveBeenCalledWith(expect.stringContaining('ConfirmAccountDeletion'), {
      token: 'raw',
    });
    expect(mockClear).toHaveBeenCalled();
  });

  it('shows the API message for a spent or expired link', async () => {
    mockSearch.mockReturnValue({ token: 'raw' });
    mockGqlRequest.mockRejectedValue(refusal('This link is invalid or has expired'));
    render(<ConfirmAccountDeletionPage />);

    await userEvent.click(screen.getByRole('button', { name: 'Delete my account' }));

    expect(await screen.findByText('This link is invalid or has expired')).toBeInTheDocument();
  });

  it('cannot be confirmed without a token', () => {
    mockSearch.mockReturnValue({});
    render(<ConfirmAccountDeletionPage />);

    expect(screen.getByRole('button', { name: 'Delete my account' })).toBeDisabled();
    expect(screen.getByText('This link is invalid or has expired.')).toBeInTheDocument();
  });
});

describe('CancelAccountDeletionPage (JEF-463)', () => {
  it('cancels with the mailed token when the button is pressed', async () => {
    mockSearch.mockReturnValue({ token: 'raw-cancel' });
    mockGqlRequest.mockResolvedValue({ cancelAccountDeletion: true });
    render(<CancelAccountDeletionPage />);

    expect(mockGqlRequest).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole('button', { name: 'Cancel deletion' }));

    expect(await screen.findByText(/Deletion cancelled/)).toBeInTheDocument();
    expect(mockGqlRequest).toHaveBeenCalledWith(expect.stringContaining('CancelAccountDeletion'), {
      token: 'raw-cancel',
    });
  });
});

describe('AccountDeletionScheduledPage (JEF-463)', () => {
  it('shows the date and cancels for the signed-in user, then opens the app', async () => {
    mockGqlRequest.mockResolvedValue({ cancelAccountDeletion: true });
    render(<AccountDeletionScheduledPage deletionScheduledAt={DATE} />);

    expect(screen.getByText(/permanently deleted on .*2026/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Cancel deletion' }));

    await vi.waitFor(() => expect(mockNavigate).toHaveBeenCalledWith({ to: '/dashboard' }));
    expect(mockGqlRequest).toHaveBeenCalledWith(
      expect.stringContaining('CancelAccountDeletion'),
      {},
    );
    expect(mockInvalidate).toHaveBeenCalled();
  });

  it('signs out instead, if asked', async () => {
    mockGqlRequest.mockResolvedValue({ logout: true });
    render(<AccountDeletionScheduledPage deletionScheduledAt={DATE} />);

    await userEvent.click(screen.getByRole('button', { name: 'Sign out' }));

    await vi.waitFor(() => expect(mockNavigate).toHaveBeenCalledWith({ to: '/login' }));
    expect(mockClear).toHaveBeenCalled();
  });
});
