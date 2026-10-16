import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const { mockNavigate, mockGqlRequest, mockUseSearch } = vi.hoisted(() => ({
  mockNavigate: vi.fn(),
  mockGqlRequest: vi.fn(),
  mockUseSearch: vi.fn().mockReturnValue({}),
}));

vi.mock('@tanstack/react-router', () => ({
  createFileRoute: () => (opts: object) => ({ ...opts, useSearch: mockUseSearch }),
  useNavigate: () => mockNavigate,
  useSearch: () => mockUseSearch(),
  Link: ({ children, to }: { children: React.ReactNode; to: string }) => (
    <a href={to}>{children}</a>
  ),
}));

vi.mock('@tanstack/react-start', () => ({
  createServerFn: () => ({ handler: (fn: () => unknown) => fn }),
}));

vi.mock('@tanstack/react-start/server', () => ({
  getCookie: vi.fn(),
}));

vi.mock('#/graphql/client', () => ({
  gqlClient: { request: mockGqlRequest },
  hasSessionCookie: vi.fn().mockReturnValue(false),
}));

vi.mock('#/lib/queryClient', () => ({
  queryClient: { resetQueries: vi.fn() },
}));

import { LoginPage } from '#/routes/-components/LoginPage';

const noTotpResponse = {
  login: { success: true, totpRequired: false, accessToken: 'access-token' },
};
const totpRequiredResponse = {
  login: { success: false, totpRequired: true, accessToken: null },
};

async function fillCredentials(email: string, password: string) {
  fireEvent.change(screen.getByPlaceholderText('you@example.com'), { target: { value: email } });
  fireEvent.change(screen.getByPlaceholderText('••••••••'), { target: { value: password } });
  fireEvent.click(screen.getByRole('button', { name: /sign in/i }));
}

describe('LoginPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseSearch.mockReturnValue({});
  });

  it('renders email and password inputs', () => {
    render(<LoginPage />);
    expect(screen.getByPlaceholderText('you@example.com')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('••••••••')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /sign in/i })).toBeInTheDocument();
  });

  it('links to the forgot-password page', () => {
    render(<LoginPage />);
    expect(screen.getByRole('link', { name: /forgot password/i })).toHaveAttribute(
      'href',
      '/forgot-password',
    );
  });

  it('shows validation error for invalid email', async () => {
    const user = userEvent.setup();
    render(<LoginPage />);
    // 'user@domain' passes HTML5 email validation (so jsdom won't sanitize it)
    // but fails Zod's stricter email regex (requires a proper TLD like .com)
    await user.type(screen.getByPlaceholderText('you@example.com'), 'user@domain');
    await user.type(screen.getByPlaceholderText('••••••••'), 'password123');
    await user.click(screen.getByRole('button', { name: /sign in/i }));

    await waitFor(() => {
      expect(screen.getByText('Invalid email')).toBeInTheDocument();
    });
    expect(mockGqlRequest).not.toHaveBeenCalled();
  });

  it('shows validation error when password is too short', async () => {
    render(<LoginPage />);
    await fillCredentials('test@example.com', 'short');

    await waitFor(() => {
      expect(screen.getByText('Password must be at least 8 characters')).toBeInTheDocument();
    });
    expect(mockGqlRequest).not.toHaveBeenCalled();
  });

  it('calls gqlClient.request with email and password on valid submit', async () => {
    mockGqlRequest.mockResolvedValue(noTotpResponse);
    render(<LoginPage />);
    await fillCredentials('test@example.com', 'password123');

    await waitFor(() => {
      expect(mockGqlRequest).toHaveBeenCalledWith(expect.stringContaining('Login'), {
        email: 'test@example.com',
        password: 'password123',
        captchaToken: null,
      });
    });
  });

  it('navigates to /dashboard after successful login without 2FA', async () => {
    mockGqlRequest.mockResolvedValue(noTotpResponse);
    render(<LoginPage />);
    await fillCredentials('test@example.com', 'password123');

    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith({ to: '/dashboard' });
    });
  });

  it('navigates to the captured returnTo destination after login instead of the dashboard', async () => {
    mockUseSearch.mockReturnValue({ returnTo: '/applications/abc123?tab=notes' });
    mockGqlRequest.mockResolvedValue(noTotpResponse);
    render(<LoginPage />);
    await fillCredentials('test@example.com', 'password123');

    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith({ to: '/applications/abc123?tab=notes' });
    });
  });

  it('falls back to the dashboard when returnTo is not a same-origin path', async () => {
    mockUseSearch.mockReturnValue({ returnTo: '//evil.example/phish' });
    mockGqlRequest.mockResolvedValue(noTotpResponse);
    render(<LoginPage />);
    await fillCredentials('test@example.com', 'password123');

    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith({ to: '/dashboard' });
    });
  });

  it('displays API error message on login failure', async () => {
    mockGqlRequest.mockRejectedValue({
      response: {
        errors: [{ message: 'Invalid credentials', extensions: { code: 'UNAUTHORIZED' } }],
      },
    });
    render(<LoginPage />);
    await fillCredentials('test@example.com', 'password123');

    await waitFor(() => {
      expect(screen.getByText('Invalid credentials')).toBeInTheDocument();
    });
    expect(mockNavigate).not.toHaveBeenCalled();
  });

  it('shows generic error message when API error has no message', async () => {
    mockGqlRequest.mockRejectedValue(new Error('Network error'));
    render(<LoginPage />);
    await fillCredentials('test@example.com', 'password123');

    await waitFor(() => {
      expect(screen.getByText('Something went wrong. Please try again.')).toBeInTheDocument();
    });
  });

  describe('two-factor authentication step', () => {
    it('shows the code entry step when the login response requires 2FA', async () => {
      mockGqlRequest.mockResolvedValue(totpRequiredResponse);
      render(<LoginPage />);
      await fillCredentials('test@example.com', 'password123');

      await waitFor(() => {
        expect(screen.getByText('Two-factor authentication')).toBeInTheDocument();
      });
      expect(mockNavigate).not.toHaveBeenCalled();
    });

    it('calls loginWithTotp with the original credentials and the code, then navigates', async () => {
      mockGqlRequest.mockResolvedValueOnce(totpRequiredResponse);
      render(<LoginPage />);
      await fillCredentials('test@example.com', 'password123');
      await waitFor(() => screen.getByPlaceholderText('123456'));

      mockGqlRequest.mockResolvedValueOnce({ loginWithTotp: 'totp-access-token' });
      fireEvent.change(screen.getByPlaceholderText('123456'), { target: { value: '654321' } });
      fireEvent.click(screen.getByRole('button', { name: /verify/i }));

      await waitFor(() => {
        expect(mockGqlRequest).toHaveBeenCalledWith(expect.stringContaining('LoginWithTotp'), {
          email: 'test@example.com',
          password: 'password123',
          code: '654321',
        });
      });
      await waitFor(() => {
        expect(mockNavigate).toHaveBeenCalledWith({ to: '/dashboard' });
      });
    });

    it('keeps the returnTo destination through the two-factor step', async () => {
      mockUseSearch.mockReturnValue({ returnTo: '/analytics' });
      mockGqlRequest.mockResolvedValueOnce(totpRequiredResponse);
      render(<LoginPage />);
      await fillCredentials('test@example.com', 'password123');
      await waitFor(() => screen.getByPlaceholderText('123456'));

      mockGqlRequest.mockResolvedValueOnce({ loginWithTotp: 'totp-access-token' });
      fireEvent.change(screen.getByPlaceholderText('123456'), { target: { value: '654321' } });
      fireEvent.click(screen.getByRole('button', { name: /verify/i }));

      await waitFor(() => {
        expect(mockNavigate).toHaveBeenCalledWith({ to: '/analytics' });
      });
    });

    it('shows an error message when the code is invalid', async () => {
      mockGqlRequest.mockResolvedValueOnce(totpRequiredResponse);
      render(<LoginPage />);
      await fillCredentials('test@example.com', 'password123');
      await waitFor(() => screen.getByPlaceholderText('123456'));

      mockGqlRequest.mockRejectedValueOnce({
        response: {
          errors: [{ message: 'Invalid verification code', extensions: { code: 'UNAUTHORIZED' } }],
        },
      });
      fireEvent.change(screen.getByPlaceholderText('123456'), { target: { value: '000000' } });
      fireEvent.click(screen.getByRole('button', { name: /verify/i }));

      await waitFor(() => {
        expect(screen.getByText('Invalid verification code')).toBeInTheDocument();
      });
      expect(mockNavigate).not.toHaveBeenCalled();
    });

    it('returns to the credentials form when "Back to sign in" is clicked', async () => {
      mockGqlRequest.mockResolvedValueOnce(totpRequiredResponse);
      render(<LoginPage />);
      await fillCredentials('test@example.com', 'password123');
      await waitFor(() => screen.getByPlaceholderText('123456'));

      fireEvent.click(screen.getByRole('button', { name: /back to sign in/i }));

      expect(screen.getByPlaceholderText('you@example.com')).toBeInTheDocument();
    });
  });

  it('renders links to sign in with Google and GitHub', () => {
    render(<LoginPage />);

    const google = screen.getByRole('link', { name: /sign in with google/i });
    const github = screen.getByRole('link', { name: /sign in with github/i });

    expect(google).toHaveAttribute('href', '/auth/oauth/google/start');
    expect(github).toHaveAttribute('href', '/auth/oauth/github/start');
  });

  it('translates the oauthError slug rather than printing it', () => {
    mockUseSearch.mockReturnValue({ oauthError: 'provider_mismatch' });
    render(<LoginPage />);

    expect(screen.queryByText('provider_mismatch')).not.toBeInTheDocument();
    expect(screen.getByText(/sign-in link has expired/i)).toBeInTheDocument();
  });

  it('falls back to generic copy for a slug this build does not know', () => {
    // A newer API reporting a case with no copy here must read as a plain
    // failure, not leak an identifier into the page — which is the shape of
    // the bug this replaced (JEF-203).
    mockUseSearch.mockReturnValue({ oauthError: 'some_future_slug' });
    render(<LoginPage />);

    expect(screen.queryByText('some_future_slug')).not.toBeInTheDocument();
    expect(screen.getByText(/didn't work/i)).toBeInTheDocument();
  });

  it('says the user cancelled, rather than calling it an error', () => {
    mockUseSearch.mockReturnValue({ oauthError: 'access_denied' });
    render(<LoginPage />);

    expect(screen.getByText(/cancelled the sign-in/i)).toBeInTheDocument();
  });

  it('links to the Privacy Policy and Terms of Service', () => {
    render(<LoginPage />);

    expect(screen.getByRole('link', { name: 'Privacy Policy' })).toHaveAttribute(
      'href',
      '/privacy',
    );
    expect(screen.getByRole('link', { name: 'Terms of Service' })).toHaveAttribute(
      'href',
      '/terms',
    );
  });
});
