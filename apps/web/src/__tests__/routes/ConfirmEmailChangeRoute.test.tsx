import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import type { ComponentType } from 'react';

const { mockGqlRequest, searchState } = vi.hoisted(() => ({
  mockGqlRequest: vi.fn(),
  searchState: { token: undefined as string | undefined },
}));

vi.mock('@tanstack/react-router', () => ({
  createFileRoute: () => (opts: object) => ({
    ...opts,
    useSearch: () => searchState,
  }),
}));

vi.mock('#/graphql/client', () => ({
  gqlClient: { request: mockGqlRequest },
}));

import { Route } from '#/routes/confirm-email-change';

const ConfirmEmailChangePage = (Route as unknown as { component: ComponentType }).component;

describe('ConfirmEmailChangePage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    searchState.token = undefined;
  });

  it('shows an invalid-link message when there is no token', () => {
    render(<ConfirmEmailChangePage />);

    expect(screen.getByText('This confirmation link is invalid.')).toBeInTheDocument();
    expect(mockGqlRequest).not.toHaveBeenCalled();
  });

  it('confirms the email change and shows a success message', async () => {
    searchState.token = 'valid-token';
    mockGqlRequest.mockResolvedValue({ confirmEmailChange: true });

    render(<ConfirmEmailChangePage />);

    expect(screen.getByText('Confirming your new email…')).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getByText(/your email address has been updated/i)).toBeInTheDocument();
    });
    expect(mockGqlRequest).toHaveBeenCalledWith(expect.stringContaining('ConfirmEmailChange'), {
      token: 'valid-token',
    });
  });

  it('shows the server error message when confirmation fails', async () => {
    searchState.token = 'expired-token';
    mockGqlRequest.mockRejectedValue({
      response: { errors: [{ message: 'This link has expired.' }] },
    });

    render(<ConfirmEmailChangePage />);

    await waitFor(() => {
      expect(screen.getByText('This link has expired.')).toBeInTheDocument();
    });
  });

  it('falls back to a generic error message when the failure has no server message', async () => {
    searchState.token = 'bad-token';
    mockGqlRequest.mockRejectedValue(new Error('boom'));

    render(<ConfirmEmailChangePage />);

    await waitFor(() => {
      expect(screen.getByText('Failed to confirm email change.')).toBeInTheDocument();
    });
  });
});
