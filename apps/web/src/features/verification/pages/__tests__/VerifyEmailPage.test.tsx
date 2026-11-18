import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';

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

import { VerifyEmailPage } from '#/features/verification/pages/VerifyEmailPage';
import { gqlContaining } from '#/__tests__/helpers/gqlText';

describe('VerifyEmailPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseSearch.mockReturnValue({ token: 'valid-token' });
  });

  it('shows an invalid-link message when there is no token', () => {
    mockUseSearch.mockReturnValue({});
    render(<VerifyEmailPage />);

    expect(screen.getByText('This verification link is invalid.')).toBeInTheDocument();
    expect(mockGqlRequest).not.toHaveBeenCalled();
  });

  it('shows a verifying state, then calls verifyEmail with the token', async () => {
    mockGqlRequest.mockResolvedValue({ verifyEmail: true });
    render(<VerifyEmailPage />);

    expect(screen.getByText('Verifying your email…')).toBeInTheDocument();

    await waitFor(() => {
      expect(mockGqlRequest).toHaveBeenCalledWith(gqlContaining('VerifyEmail'), {
        token: 'valid-token',
      });
    });
  });

  it('shows a success message once verification succeeds', async () => {
    mockGqlRequest.mockResolvedValue({ verifyEmail: true });
    render(<VerifyEmailPage />);

    await waitFor(() => {
      expect(screen.getByText('Your email has been verified.')).toBeInTheDocument();
    });
  });

  it('shows an error message when verification fails', async () => {
    mockGqlRequest.mockRejectedValue({
      response: { errors: [{ message: 'Invalid or expired verification link' }] },
    });
    render(<VerifyEmailPage />);

    await waitFor(() => {
      expect(screen.getByText('Invalid or expired verification link')).toBeInTheDocument();
    });
  });

  it('shows a generic error message when the API error has no message', async () => {
    mockGqlRequest.mockRejectedValue(new Error('network error'));
    render(<VerifyEmailPage />);

    await waitFor(() => {
      expect(screen.getByText('Failed to verify email.')).toBeInTheDocument();
    });
  });
});
