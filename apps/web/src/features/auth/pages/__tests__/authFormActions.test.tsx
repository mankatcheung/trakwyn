import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

// JEF-616: the auth pages submit through form actions. Each form is checked for
// the three things the move could break: the success path, an API error that
// must keep what was typed, and a double click that must reach the API once.

const { mockNavigate, mockGqlRequest, mockUseSearch } = vi.hoisted(() => ({
  mockNavigate: vi.fn(),
  mockGqlRequest: vi.fn(),
  mockUseSearch: vi.fn().mockReturnValue({ token: 'valid-token' }),
}));

vi.mock('@tanstack/react-router', () => ({
  createFileRoute: () => (opts: object) => opts,
  useNavigate: () => mockNavigate,
  useSearch: () => mockUseSearch(),
  Link: ({ children, to }: { children: React.ReactNode; to: string }) => (
    <a href={to}>{children}</a>
  ),
}));

vi.mock('#/graphql/client', () => ({
  gqlClient: { request: mockGqlRequest },
  hasSessionCookie: vi.fn().mockReturnValue(false),
}));

vi.mock('#/lib/queryClient', () => ({
  queryClient: { resetQueries: vi.fn() },
}));

import { LoginPage } from '#/features/auth/pages/LoginPage';
import { RegisterPage } from '#/features/auth/pages/RegisterPage';
import { ForgotPasswordPage } from '#/features/auth/pages/ForgotPasswordPage';
import { ResetPasswordPage } from '#/features/auth/pages/ResetPasswordPage';
import { gqlContaining } from '#/__tests__/helpers/gqlText';

const apiError = (message: string) => ({
  response: { errors: [{ message, extensions: { code: 'UNAUTHORIZED' } }] },
});

/** A request that stays open until `release` is called. */
function holdRequest() {
  let release!: (value: unknown) => void;
  mockGqlRequest.mockImplementation(
    () =>
      new Promise((resolve) => {
        release = resolve;
      }),
  );
  return (value: unknown) => release(value);
}

/** The form's submit button, found by type because its label changes while pending. */
function submitButton() {
  return document.querySelector<HTMLButtonElement>('form button[type="submit"]')!;
}

function typeInto(placeholder: string, value: string, index = 0) {
  fireEvent.change(screen.getAllByPlaceholderText(placeholder)[index], { target: { value } });
}

describe('auth pages as form actions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseSearch.mockReturnValue({ token: 'valid-token' });
  });

  describe('LoginPage', () => {
    const submit = () => fireEvent.click(submitButton());
    const fill = () => {
      typeInto('you@example.com', 'test@example.com');
      typeInto('••••••••', 'password123');
    };

    it('signs in and navigates on success', async () => {
      mockGqlRequest.mockResolvedValue({ login: { totpRequired: false } });
      render(<LoginPage />);
      fill();
      submit();
      await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith({ to: '/dashboard' }));
    });

    it('shows the API error and keeps the typed email', async () => {
      mockGqlRequest.mockRejectedValue(apiError('Invalid credentials'));
      render(<LoginPage />);
      fill();
      submit();
      expect(await screen.findByText('Invalid credentials')).toBeInTheDocument();
      expect(screen.getByPlaceholderText('you@example.com')).toHaveValue('test@example.com');
      expect(screen.getByPlaceholderText('••••••••')).toHaveValue('password123');
    });

    it('signs in once on a double click', async () => {
      const release = holdRequest();
      render(<LoginPage />);
      fill();
      submit();
      await waitFor(() => expect(mockGqlRequest).toHaveBeenCalledTimes(1));
      submit();
      release({ login: { totpRequired: false } });
      await waitFor(() => expect(mockNavigate).toHaveBeenCalledTimes(1));
      expect(mockGqlRequest).toHaveBeenCalledTimes(1);
    });

    it('asks for the captcha when the API requires one, and keeps the email', async () => {
      mockGqlRequest.mockRejectedValue({
        response: { errors: [{ message: 'x', extensions: { code: 'CAPTCHA_REQUIRED' } }] },
      });
      render(<LoginPage />);
      fill();
      submit();
      expect(await screen.findByText('Complete the captcha to continue.')).toBeInTheDocument();
      expect(screen.getByPlaceholderText('you@example.com')).toHaveValue('test@example.com');
    });

    describe('two-factor step', () => {
      async function reachTotpStep() {
        mockGqlRequest.mockResolvedValueOnce({ login: { totpRequired: true } });
        render(<LoginPage />);
        fill();
        submit();
        await screen.findByPlaceholderText('123456');
      }
      const verify = () => fireEvent.click(screen.getByRole('button', { name: /verify/i }));

      it('verifies the code and navigates on success', async () => {
        await reachTotpStep();
        mockGqlRequest.mockResolvedValueOnce({ loginWithTotp: 'ok' });
        typeInto('123456', '654321');
        verify();
        await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith({ to: '/dashboard' }));
      });

      it('shows the error and keeps the typed code', async () => {
        await reachTotpStep();
        mockGqlRequest.mockRejectedValueOnce(apiError('Invalid verification code'));
        typeInto('123456', '000000');
        verify();
        expect(await screen.findByText('Invalid verification code')).toBeInTheDocument();
        expect(screen.getByPlaceholderText('123456')).toHaveValue('000000');
      });

      it('verifies once on a double click', async () => {
        await reachTotpStep();
        const release = holdRequest();
        typeInto('123456', '654321');
        verify();
        await waitFor(() => expect(mockGqlRequest).toHaveBeenCalledTimes(2));
        verify();
        release({ loginWithTotp: 'ok' });
        await waitFor(() => expect(mockNavigate).toHaveBeenCalledTimes(1));
        expect(mockGqlRequest).toHaveBeenCalledTimes(2);
      });
    });
  });

  describe('RegisterPage', () => {
    const submit = () => fireEvent.click(submitButton());
    const fill = () => {
      typeInto('you@example.com', 'new@example.com');
      typeInto('••••••••', 'password123');
    };

    it('registers and shows the check-your-email screen', async () => {
      mockGqlRequest.mockResolvedValue({ register: 'ok' });
      render(<RegisterPage />);
      fill();
      submit();
      expect(await screen.findByText('new@example.com')).toBeInTheDocument();
    });

    it('shows the API error and keeps the typed email', async () => {
      mockGqlRequest.mockRejectedValue(apiError('Email already in use'));
      render(<RegisterPage />);
      fill();
      submit();
      expect(await screen.findByText('Email already in use')).toBeInTheDocument();
      expect(screen.getByPlaceholderText('you@example.com')).toHaveValue('new@example.com');
    });

    it('registers once on a double click', async () => {
      const release = holdRequest();
      render(<RegisterPage />);
      fill();
      submit();
      await waitFor(() => expect(mockGqlRequest).toHaveBeenCalledTimes(1));
      submit();
      release({ register: 'ok' });
      await screen.findByText('new@example.com');
      expect(mockGqlRequest).toHaveBeenCalledTimes(1);
    });
  });

  describe('ForgotPasswordPage', () => {
    const submit = () => fireEvent.click(submitButton());

    it('shows the success message', async () => {
      mockGqlRequest.mockResolvedValue({ requestPasswordReset: true });
      render(<ForgotPasswordPage />);
      typeInto('you@example.com', 'test@example.com');
      submit();
      expect(await screen.findByText(/If an account exists for that email/)).toBeInTheDocument();
    });

    it('shows the API error and keeps the typed email', async () => {
      mockGqlRequest.mockRejectedValue(apiError('Too many requests'));
      render(<ForgotPasswordPage />);
      typeInto('you@example.com', 'test@example.com');
      submit();
      expect(await screen.findByText('Too many requests')).toBeInTheDocument();
      expect(screen.getByPlaceholderText('you@example.com')).toHaveValue('test@example.com');
      expect(screen.queryByText(/If an account exists for that email/)).not.toBeInTheDocument();
    });

    it('sends once on a double click', async () => {
      const release = holdRequest();
      render(<ForgotPasswordPage />);
      typeInto('you@example.com', 'test@example.com');
      submit();
      await waitFor(() => expect(mockGqlRequest).toHaveBeenCalledTimes(1));
      submit();
      release({ requestPasswordReset: true });
      await screen.findByText(/If an account exists for that email/);
      expect(mockGqlRequest).toHaveBeenCalledTimes(1);
    });

    it('sends the backup-email request and keeps the email after an error', async () => {
      mockGqlRequest.mockRejectedValue(apiError('Too many requests'));
      render(<ForgotPasswordPage />);
      fireEvent.click(screen.getByRole('button', { name: /use a backup email/i }));
      typeInto('you@example.com', 'backup@example.com');
      fireEvent.click(screen.getByRole('button', { name: 'Send recovery link' }));
      expect(await screen.findByText('Too many requests')).toBeInTheDocument();
      expect(screen.getByPlaceholderText('you@example.com')).toHaveValue('backup@example.com');
    });
  });

  describe('ResetPasswordPage', () => {
    const submit = () => fireEvent.click(submitButton());
    const fill = () => {
      typeInto('••••••••', 'newPassword123', 0);
      typeInto('••••••••', 'newPassword123', 1);
    };

    it('resets the password and shows success', async () => {
      mockGqlRequest.mockResolvedValue({ resetPassword: true });
      render(<ResetPasswordPage />);
      fill();
      submit();
      expect(await screen.findByText('Your password has been reset.')).toBeInTheDocument();
      expect(mockGqlRequest).toHaveBeenCalledWith(gqlContaining('ResetPassword'), {
        token: 'valid-token',
        newPassword: 'newPassword123',
      });
      expect(screen.queryByPlaceholderText('••••••••')).not.toBeInTheDocument();
    });

    it('shows the API error and keeps the typed passwords', async () => {
      mockGqlRequest.mockRejectedValue(apiError('Link expired'));
      render(<ResetPasswordPage />);
      fill();
      submit();
      expect(await screen.findByText('Link expired')).toBeInTheDocument();
      const [first, second] = screen.getAllByPlaceholderText('••••••••');
      expect(first).toHaveValue('newPassword123');
      expect(second).toHaveValue('newPassword123');
    });

    it('resets once on a double click', async () => {
      const release = holdRequest();
      render(<ResetPasswordPage />);
      fill();
      submit();
      await waitFor(() => expect(mockGqlRequest).toHaveBeenCalledTimes(1));
      submit();
      release({ resetPassword: true });
      await waitFor(() =>
        expect(screen.queryByPlaceholderText('••••••••')).not.toBeInTheDocument(),
      );
      expect(mockGqlRequest).toHaveBeenCalledTimes(1);
    });
  });
});
