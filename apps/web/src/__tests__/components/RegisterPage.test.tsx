import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const { mockNavigate, mockGqlRequest } = vi.hoisted(() => ({
  mockNavigate: vi.fn(),
  mockGqlRequest: vi.fn(),
}));

vi.mock('@tanstack/react-router', () => ({
  createFileRoute: () => (opts: unknown) => opts,
  useNavigate: () => mockNavigate,
  redirect: vi.fn(),
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

import { RegisterPage } from '#/routes/-components/RegisterPage';

const fillForm = (email: string, password: string, confirm: string) => {
  fireEvent.change(screen.getByPlaceholderText('you@example.com'), {
    target: { value: email },
  });
  const [passwordInput, confirmInput] = screen.getAllByPlaceholderText('••••••••');
  fireEvent.change(passwordInput, { target: { value: password } });
  fireEvent.change(confirmInput, { target: { value: confirm } });
};

describe('RegisterPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders email, password, and confirm password inputs', () => {
    render(<RegisterPage />);
    expect(screen.getByPlaceholderText('you@example.com')).toBeInTheDocument();
    const passwordInputs = screen.getAllByPlaceholderText('••••••••');
    expect(passwordInputs).toHaveLength(2);
    expect(screen.getByRole('button', { name: /create account/i })).toBeInTheDocument();
  });

  it('shows error when passwords do not match', async () => {
    render(<RegisterPage />);
    fillForm('test@example.com', 'password123', 'different123');
    fireEvent.click(screen.getByRole('button', { name: /create account/i }));

    await waitFor(() => {
      expect(screen.getByText('Passwords do not match')).toBeInTheDocument();
    });
    expect(mockGqlRequest).not.toHaveBeenCalled();
  });

  it('shows validation error for invalid email', async () => {
    const user = userEvent.setup();
    render(<RegisterPage />);
    // 'user@domain' passes HTML5 email validation (so jsdom won't sanitize it)
    // but fails Zod's stricter email regex (requires a proper TLD like .com)
    await user.type(screen.getByPlaceholderText('you@example.com'), 'user@domain');
    const [pw, confirm] = screen.getAllByPlaceholderText('••••••••');
    await user.type(pw, 'password123');
    await user.type(confirm, 'password123');
    await user.click(screen.getByRole('button', { name: /create account/i }));

    await waitFor(() => {
      expect(screen.getByText('Invalid email')).toBeInTheDocument();
    });
    expect(mockGqlRequest).not.toHaveBeenCalled();
  });

  it('shows error when password is too short', async () => {
    render(<RegisterPage />);
    fillForm('test@example.com', 'short', 'short');
    fireEvent.click(screen.getByRole('button', { name: /create account/i }));

    await waitFor(() => {
      expect(screen.getByText('Password must be at least 8 characters')).toBeInTheDocument();
    });
    expect(mockGqlRequest).not.toHaveBeenCalled();
  });

  it('submits only email and password (not confirmPassword) when valid', async () => {
    mockGqlRequest.mockResolvedValue({ register: 'access-token' });
    render(<RegisterPage />);
    fillForm('test@example.com', 'password123', 'password123');
    fireEvent.click(screen.getByRole('button', { name: /create account/i }));

    await waitFor(() => {
      expect(mockGqlRequest).toHaveBeenCalledWith(expect.stringContaining('Register'), {
        email: 'test@example.com',
        password: 'password123',
        captchaToken: null,
      });
    });
    expect(mockGqlRequest).not.toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ confirmPassword: expect.anything() }),
    );
  });

  it('shows check your email message after successful registration', async () => {
    mockGqlRequest.mockResolvedValue({ register: 'access-token' });
    render(<RegisterPage />);
    fillForm('test@example.com', 'password123', 'password123');
    fireEvent.click(screen.getByRole('button', { name: /create account/i }));

    await waitFor(() => {
      expect(screen.getByText('Check your email')).toBeInTheDocument();
    });
    expect(screen.getByText(/test@example.com/)).toBeInTheDocument();
  });

  it('sends the signed-in user on to the app, not back to the login page (JEF-438)', async () => {
    // Registering signs the user in, so /login would only bounce them to the
    // app; an unverified account lands on the verification reminder there.
    mockGqlRequest.mockResolvedValue({ register: 'access-token' });
    render(<RegisterPage />);
    fillForm('test@example.com', 'password123', 'password123');
    fireEvent.click(screen.getByRole('button', { name: /create account/i }));

    const link = await screen.findByRole('link', { name: 'Continue' });

    expect(link).toHaveAttribute('href', '/dashboard');
    expect(screen.queryByText('Back to sign in')).not.toBeInTheDocument();
  });

  it('shows API error on registration failure', async () => {
    mockGqlRequest.mockRejectedValue({
      response: { errors: [{ message: 'Email already registered' }] },
    });
    render(<RegisterPage />);
    fillForm('taken@example.com', 'password123', 'password123');
    fireEvent.click(screen.getByRole('button', { name: /create account/i }));

    await waitFor(() => {
      expect(screen.getByText('Email already registered')).toBeInTheDocument();
    });
    expect(mockNavigate).not.toHaveBeenCalled();
  });

  it('shows generic error when network fails', async () => {
    mockGqlRequest.mockRejectedValue(new Error('network error'));
    render(<RegisterPage />);
    fillForm('test@example.com', 'password123', 'password123');
    fireEvent.click(screen.getByRole('button', { name: /create account/i }));

    await waitFor(() => {
      expect(screen.getByText('Registration failed. Please try again.')).toBeInTheDocument();
    });
    expect(mockNavigate).not.toHaveBeenCalled();
  });

  it('renders links to sign up with Google and GitHub', () => {
    render(<RegisterPage />);

    const google = screen.getByRole('link', { name: /sign up with google/i });
    const github = screen.getByRole('link', { name: /sign up with github/i });

    expect(google).toHaveAttribute('href', '/auth/oauth/google/start');
    expect(github).toHaveAttribute('href', '/auth/oauth/github/start');
  });

  it('links to the Terms of Service and Privacy Policy', () => {
    render(<RegisterPage />);

    expect(screen.getByRole('link', { name: 'Terms of Service' })).toHaveAttribute(
      'href',
      '/terms',
    );
    expect(screen.getByRole('link', { name: 'Privacy Policy' })).toHaveAttribute(
      'href',
      '/privacy',
    );
  });
});
