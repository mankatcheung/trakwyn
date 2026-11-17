import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';

const { mockGqlRequest, mockUseSearch } = vi.hoisted(() => ({
  mockGqlRequest: vi.fn(),
  mockUseSearch: vi.fn(),
}));

vi.mock('@tanstack/react-router', () => ({
  useSearch: mockUseSearch,
  Link: ({ children, to }: { children: React.ReactNode; to: string }) => (
    <a href={to}>{children}</a>
  ),
}));

vi.mock('#/graphql/client', () => ({
  gqlClient: { request: mockGqlRequest },
}));

import { ConfirmBackupEmailPage } from '#/features/auth/pages/ConfirmBackupEmailPage';

describe('ConfirmBackupEmailPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('shows an error message when there is no token', () => {
    mockUseSearch.mockReturnValue({ token: undefined });
    render(<ConfirmBackupEmailPage />);

    expect(screen.getByText(/this verification link is invalid or expired/i)).toBeInTheDocument();
    expect(mockGqlRequest).not.toHaveBeenCalled();
  });

  it('verifies the backup email and shows a success message', async () => {
    mockUseSearch.mockReturnValue({ token: 'valid-token' });
    mockGqlRequest.mockResolvedValue({ confirmBackupEmail: true });

    render(<ConfirmBackupEmailPage />);

    expect(screen.getByText('Verifying your email…')).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getByText(/your backup email is verified/i)).toBeInTheDocument();
    });
    expect(mockGqlRequest).toHaveBeenCalledWith(expect.stringContaining('ConfirmBackupEmail'), {
      token: 'valid-token',
    });
  });

  it('shows an error message when verification fails', async () => {
    mockUseSearch.mockReturnValue({ token: 'bad-token' });
    mockGqlRequest.mockRejectedValue(new Error('boom'));

    render(<ConfirmBackupEmailPage />);

    await waitFor(() => {
      expect(screen.getByText(/this verification link is invalid or expired/i)).toBeInTheDocument();
    });
  });

  it('links back to sign in', () => {
    mockUseSearch.mockReturnValue({ token: undefined });
    render(<ConfirmBackupEmailPage />);

    expect(screen.getByRole('link', { name: /back to sign in/i })).toHaveAttribute(
      'href',
      '/login',
    );
  });
});
