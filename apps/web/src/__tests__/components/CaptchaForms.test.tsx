import { describe, it, expect, vi, beforeEach } from 'vitest';
import { useEffect } from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

const { mockNavigate, mockGqlRequest } = vi.hoisted(() => ({
  mockNavigate: vi.fn(),
  mockGqlRequest: vi.fn(),
}));

vi.mock('@tanstack/react-router', () => ({
  createFileRoute: () => (opts: object) => opts,
  useNavigate: () => mockNavigate,
  useSearch: () => ({}),
  Link: ({ children, to }: { children: React.ReactNode; to: string }) => (
    <a href={to}>{children}</a>
  ),
}));

vi.mock('@tanstack/react-start', () => ({
  createServerFn: () => ({ handler: (fn: () => unknown) => fn }),
}));

vi.mock('@tanstack/react-start/server', () => ({ getCookie: vi.fn() }));

vi.mock('#/graphql/client', () => ({
  gqlClient: { request: mockGqlRequest },
  hasSessionCookie: vi.fn().mockReturnValue(false),
}));

vi.mock('#/lib/queryClient', () => ({ queryClient: { resetQueries: vi.fn() } }));

// A stand-in for the Turnstile widget (JEF-401): the real one loads
// Cloudflare's script, which a unit test neither can nor should. "Solving" it
// hands the page a token, and each remount (the page's `key`) hands out the
// next one, as a fresh challenge would.
let solves = 0;
vi.mock('#/components/CaptchaWidget', () => ({
  CAPTCHA_ENABLED: true,
  CaptchaWidget: ({ onToken }: { onToken: (token: string | null) => void }) => {
    // Like the real widget, give the token back when unmounted.
    useEffect(() => () => onToken(null), []); // eslint-disable-line react-hooks/exhaustive-deps
    return (
      <button type="button" onClick={() => onToken(`token-${++solves}`)}>
        Solve captcha
      </button>
    );
  },
}));

import { LoginPage } from '#/routes/-components/LoginPage';
import { RegisterPage } from '#/routes/-components/RegisterPage';
import { ForgotPasswordPage } from '#/routes/-components/ForgotPasswordPage';

const gqlError = (code: string, message: string) => ({
  response: { errors: [{ message, extensions: { code } }] },
});

const solveCaptcha = () => fireEvent.click(screen.getByRole('button', { name: 'Solve captcha' }));

describe('captcha on the auth forms', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    solves = 0;
  });

  describe('RegisterPage', () => {
    const fillForm = () => {
      const [email] = screen.getAllByPlaceholderText('you@example.com');
      const [password, confirm] = screen.getAllByPlaceholderText('••••••••');
      fireEvent.change(email, { target: { value: 'new@example.com' } });
      fireEvent.change(password, { target: { value: 'password123' } });
      fireEvent.change(confirm, { target: { value: 'password123' } });
    };

    it('disables sign-up until the captcha is solved, then sends the token', async () => {
      mockGqlRequest.mockResolvedValue({ register: 'access-token' });
      render(<RegisterPage />);
      fillForm();

      expect(screen.getByRole('button', { name: /create account/i })).toBeDisabled();

      solveCaptcha();
      fireEvent.click(screen.getByRole('button', { name: /create account/i }));

      await waitFor(() => {
        expect(mockGqlRequest).toHaveBeenCalledWith(expect.stringContaining('Register'), {
          email: 'new@example.com',
          password: 'password123',
          captchaToken: 'token-1',
        });
      });
    });

    it('asks for a fresh captcha after a refused sign-up', async () => {
      mockGqlRequest.mockRejectedValue(gqlError('CAPTCHA_FAILED', 'Captcha verification failed.'));
      render(<RegisterPage />);
      fillForm();
      solveCaptcha();

      fireEvent.click(screen.getByRole('button', { name: /create account/i }));

      expect(await screen.findByText('Captcha verification failed.')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /create account/i })).toBeDisabled();
    });
  });

  describe('LoginPage', () => {
    const submit = () => {
      fireEvent.change(screen.getByPlaceholderText('you@example.com'), {
        target: { value: 'user@example.com' },
      });
      fireEvent.change(screen.getByPlaceholderText('••••••••'), {
        target: { value: 'password123' },
      });
      fireEvent.click(screen.getByRole('button', { name: /^sign in$/i }));
    };

    it('shows no captcha until the API asks for one', () => {
      render(<LoginPage />);

      expect(screen.queryByRole('button', { name: 'Solve captcha' })).not.toBeInTheDocument();
      expect(screen.getByRole('button', { name: /^sign in$/i })).toBeEnabled();
    });

    it('reveals the captcha when the API requires it, and retries with the token', async () => {
      mockGqlRequest
        .mockRejectedValueOnce(gqlError('CAPTCHA_REQUIRED', 'Complete the captcha to continue'))
        .mockResolvedValueOnce({ login: { success: true, totpRequired: false, accessToken: 'a' } });
      render(<LoginPage />);

      submit();

      expect(await screen.findByText('Complete the captcha to continue.')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /^sign in$/i })).toBeDisabled();

      solveCaptcha();
      fireEvent.click(screen.getByRole('button', { name: /^sign in$/i }));

      await waitFor(() => {
        expect(mockGqlRequest).toHaveBeenLastCalledWith(expect.stringContaining('Login'), {
          email: 'user@example.com',
          password: 'password123',
          captchaToken: 'token-1',
        });
      });
      await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith({ to: '/dashboard' }));
    });

    it('says so when the captcha it was given is refused', async () => {
      mockGqlRequest.mockRejectedValue(gqlError('CAPTCHA_FAILED', 'Captcha verification failed.'));
      render(<LoginPage />);

      submit();

      expect(
        await screen.findByText('Captcha verification failed. Please try again.'),
      ).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Solve captcha' })).toBeInTheDocument();
    });
  });

  describe('ForgotPasswordPage', () => {
    it('sends the token with the reset request', async () => {
      mockGqlRequest.mockResolvedValue({ requestPasswordReset: true });
      render(<ForgotPasswordPage />);
      fireEvent.input(screen.getByLabelText('Email'), { target: { value: 'user@example.com' } });

      expect(screen.getByRole('button', { name: 'Send reset link' })).toBeDisabled();

      solveCaptcha();
      fireEvent.click(screen.getByRole('button', { name: 'Send reset link' }));

      await waitFor(() => {
        expect(mockGqlRequest).toHaveBeenCalledWith(
          expect.stringContaining('RequestPasswordReset'),
          { email: 'user@example.com', captchaToken: 'token-1' },
        );
      });
    });

    it('needs a new solve after switching modes and back, not the old token', () => {
      render(<ForgotPasswordPage />);
      solveCaptcha();
      expect(screen.getByRole('button', { name: 'Send reset link' })).toBeEnabled();

      fireEvent.click(screen.getByRole('button', { name: /backup email/i }));
      fireEvent.click(screen.getByRole('button', { name: /primary email/i }));

      expect(screen.getByRole('button', { name: 'Send reset link' })).toBeDisabled();
    });

    it('shows no captcha for backup-email recovery', () => {
      render(<ForgotPasswordPage />);

      fireEvent.click(screen.getByRole('button', { name: /backup email/i }));

      expect(screen.queryByRole('button', { name: 'Solve captcha' })).not.toBeInTheDocument();
    });
  });
});
