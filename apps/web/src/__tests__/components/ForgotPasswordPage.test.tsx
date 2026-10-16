import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

const { mockGqlRequest } = vi.hoisted(() => ({
  mockGqlRequest: vi.fn(),
}));

vi.mock('@tanstack/react-router', () => ({
  Link: ({ children, to }: { children: React.ReactNode; to: string }) => (
    <a href={to}>{children}</a>
  ),
}));

vi.mock('#/graphql/client', () => ({
  gqlClient: { request: mockGqlRequest },
}));

import { ForgotPasswordPage } from '#/routes/-components/ForgotPasswordPage';

describe('ForgotPasswordPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders the form', () => {
    render(<ForgotPasswordPage />);
    expect(screen.getByLabelText('Email')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Send reset link' })).toBeInTheDocument();
  });

  it('submits the form and shows success message', async () => {
    mockGqlRequest.mockResolvedValue({ requestPasswordReset: true });
    render(<ForgotPasswordPage />);

    await fireEvent.input(screen.getByLabelText('Email'), {
      target: { value: 'test@example.com' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Send reset link' }));

    await waitFor(() => {
      expect(screen.getByText(/If an account exists for that email/)).toBeInTheDocument();
    });
    expect(mockGqlRequest).toHaveBeenCalledWith(expect.stringContaining('RequestPasswordReset'), {
      email: 'test@example.com',
      captchaToken: null,
    });
  });

  it('can request recovery through a backup email', async () => {
    mockGqlRequest.mockResolvedValue({ requestBackupEmailRecovery: true });
    render(<ForgotPasswordPage />);

    fireEvent.click(screen.getByRole('button', { name: /use a backup email/i }));
    await fireEvent.input(screen.getByLabelText('Email'), {
      target: { value: 'backup@example.com' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Send recovery link' }));

    await waitFor(() => {
      expect(screen.getByText(/sent a recovery link/i)).toBeInTheDocument();
    });
    expect(mockGqlRequest).toHaveBeenCalledWith(
      expect.stringContaining('RequestBackupEmailRecovery'),
      {
        backupEmail: 'backup@example.com',
      },
    );
  });
});
