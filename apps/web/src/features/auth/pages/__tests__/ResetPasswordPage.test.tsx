import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

const { mockGqlRequest, mockUseSearch } = vi.hoisted(() => ({
  mockGqlRequest: vi.fn(),
  mockUseSearch: vi.fn().mockReturnValue({ token: 'valid-token' }),
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

import { ResetPasswordPage } from '#/features/auth/pages/ResetPasswordPage';

describe('ResetPasswordPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseSearch.mockReturnValue({ token: 'valid-token' });
  });

  it('shows an invalid-link message when there is no token', () => {
    mockUseSearch.mockReturnValue({});
    render(<ResetPasswordPage />);

    expect(screen.getByText(/this reset link is invalid/i)).toBeInTheDocument();
    expect(screen.queryByPlaceholderText('••••••••')).not.toBeInTheDocument();
  });

  it('renders the password fields when a token is present', () => {
    render(<ResetPasswordPage />);
    expect(screen.getAllByPlaceholderText('••••••••')).toHaveLength(2);
    expect(screen.getByRole('button', { name: /reset password/i })).toBeInTheDocument();
  });

  it('shows a validation error when passwords do not match', async () => {
    render(<ResetPasswordPage />);
    const inputs = screen.getAllByPlaceholderText('••••••••');

    fireEvent.change(inputs[0], { target: { value: 'newPassword123' } });
    fireEvent.change(inputs[1], { target: { value: 'differentPassword' } });
    fireEvent.click(screen.getByRole('button', { name: /reset password/i }));

    await waitFor(() => {
      expect(screen.getByText('Passwords do not match')).toBeInTheDocument();
    });
    expect(mockGqlRequest).not.toHaveBeenCalled();
  });

  it('shows a validation error when the password is too short', async () => {
    render(<ResetPasswordPage />);
    const inputs = screen.getAllByPlaceholderText('••••••••');

    fireEvent.change(inputs[0], { target: { value: 'short' } });
    fireEvent.change(inputs[1], { target: { value: 'short' } });
    fireEvent.click(screen.getByRole('button', { name: /reset password/i }));

    await waitFor(() => {
      expect(screen.getByText('Password must be at least 8 characters')).toBeInTheDocument();
    });
    expect(mockGqlRequest).not.toHaveBeenCalled();
  });

  it('calls resetPassword with the token and new password, then shows success', async () => {
    mockGqlRequest.mockResolvedValue({ resetPassword: true });
    render(<ResetPasswordPage />);
    const inputs = screen.getAllByPlaceholderText('••••••••');

    fireEvent.change(inputs[0], { target: { value: 'newPassword123' } });
    fireEvent.change(inputs[1], { target: { value: 'newPassword123' } });
    fireEvent.click(screen.getByRole('button', { name: /reset password/i }));

    await waitFor(() => {
      expect(mockGqlRequest).toHaveBeenCalledWith(expect.stringContaining('ResetPassword'), {
        token: 'valid-token',
        newPassword: 'newPassword123',
      });
    });
    await waitFor(() => {
      expect(screen.getByText('Your password has been reset.')).toBeInTheDocument();
    });
  });

  it('shows an error message when the reset link is invalid or expired', async () => {
    mockGqlRequest.mockRejectedValue({
      response: { errors: [{ message: 'Invalid or expired reset link' }] },
    });
    render(<ResetPasswordPage />);
    const inputs = screen.getAllByPlaceholderText('••••••••');

    fireEvent.change(inputs[0], { target: { value: 'newPassword123' } });
    fireEvent.change(inputs[1], { target: { value: 'newPassword123' } });
    fireEvent.click(screen.getByRole('button', { name: /reset password/i }));

    await waitFor(() => {
      expect(screen.getByText('Invalid or expired reset link')).toBeInTheDocument();
    });
  });
});
