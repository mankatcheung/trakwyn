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

const { mockCapture } = vi.hoisted(() => ({ mockCapture: vi.fn() }));
vi.mock('#/lib/analytics/analytics', async (importOriginal) => ({
  ...(await importOriginal<typeof import('#/lib/analytics/analytics')>()),
  captureEvent: mockCapture,
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

const fillForm = (email: string, password: string) => {
  fireEvent.change(screen.getByPlaceholderText('you@example.com'), {
    target: { value: email },
  });
  fireEvent.change(screen.getByPlaceholderText('••••••••'), { target: { value: password } });
};

describe('RegisterPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('reports register_started once, on the first field focus', async () => {
    const user = userEvent.setup();
    render(<RegisterPage />);
    expect(mockCapture).not.toHaveBeenCalled();

    await user.click(screen.getByPlaceholderText('you@example.com'));
    await user.click(screen.getByPlaceholderText('••••••••'));

    expect(mockCapture.mock.calls).toEqual([['register_started']]);
  });

  it('reports register_completed with the password method, and no email', async () => {
    mockGqlRequest.mockResolvedValue({ register: 'access-token' });
    render(<RegisterPage />);
    fillForm('test@example.com', 'password123');
    fireEvent.click(screen.getByRole('button', { name: /create account/i }));

    await waitFor(() => {
      expect(mockCapture).toHaveBeenCalledWith('register_completed', { method: 'password' });
    });
    expect(JSON.stringify(mockCapture.mock.calls)).not.toContain('test@example.com');
  });

  it('does not report register_completed when the registration fails', async () => {
    mockGqlRequest.mockRejectedValue(new Error('boom'));
    render(<RegisterPage />);
    fillForm('test@example.com', 'password123');
    fireEvent.click(screen.getByRole('button', { name: /create account/i }));

    await waitFor(() => expect(mockGqlRequest).toHaveBeenCalled());
    expect(mockCapture).not.toHaveBeenCalledWith('register_completed', expect.anything());
  });

  it('remembers an OAuth sign-up so the app can report it after the round trip', async () => {
    window.sessionStorage.clear();
    const user = userEvent.setup();
    render(<RegisterPage />);

    await user.click(screen.getByRole('link', { name: /sign up with google/i }));

    expect(window.sessionStorage.getItem('trakwyn_oauth_registration')).toBe('google');
  });

  it('renders email and password inputs, and no confirm-password field', () => {
    render(<RegisterPage />);
    expect(screen.getByPlaceholderText('you@example.com')).toBeInTheDocument();
    expect(screen.getAllByPlaceholderText('••••••••')).toHaveLength(1);
    expect(screen.queryByText(/confirm password/i)).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /create account/i })).toBeInTheDocument();
  });

  it('puts the OAuth buttons before the email form, split by an "or" divider (JEF-520)', () => {
    render(<RegisterPage />);
    const google = screen.getByRole('link', { name: /sign up with google/i });
    const divider = screen.getByText('or sign up with email');
    const email = screen.getByPlaceholderText('you@example.com');

    expect(google.compareDocumentPosition(divider) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(divider.compareDocumentPosition(email) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('tells the visitor the plan is free with no card, under the title (JEF-520)', () => {
    render(<RegisterPage />);
    const heading = screen.getByRole('heading', { name: 'Create account' });
    const note = screen.getByText('Free plan · No credit card');

    expect(heading.compareDocumentPosition(note) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(
      note.compareDocumentPosition(screen.getByRole('link', { name: /sign up with google/i })) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  it('toggles the password between hidden and visible', async () => {
    const user = userEvent.setup();
    render(<RegisterPage />);
    const input = screen.getByPlaceholderText('••••••••');
    expect(input).toHaveAttribute('type', 'password');

    await user.click(screen.getByRole('button', { name: 'Show password' }));
    expect(input).toHaveAttribute('type', 'text');

    await user.click(screen.getByRole('button', { name: 'Hide password' }));
    expect(input).toHaveAttribute('type', 'password');
  });

  it('shows validation error for invalid email', async () => {
    const user = userEvent.setup();
    render(<RegisterPage />);
    // 'user@domain' passes HTML5 email validation (so jsdom won't sanitize it)
    // but fails Zod's stricter email regex (requires a proper TLD like .com)
    await user.type(screen.getByPlaceholderText('you@example.com'), 'user@domain');
    await user.type(screen.getByPlaceholderText('••••••••'), 'password123');
    await user.click(screen.getByRole('button', { name: /create account/i }));

    await waitFor(() => {
      expect(screen.getByText('Invalid email')).toBeInTheDocument();
    });
    expect(mockGqlRequest).not.toHaveBeenCalled();
  });

  it('shows error when password is too short', async () => {
    render(<RegisterPage />);
    fillForm('test@example.com', 'short');
    fireEvent.click(screen.getByRole('button', { name: /create account/i }));

    await waitFor(() => {
      expect(screen.getByText('Password must be at least 8 characters')).toBeInTheDocument();
    });
    expect(mockGqlRequest).not.toHaveBeenCalled();
  });

  it('submits only email and password when valid', async () => {
    mockGqlRequest.mockResolvedValue({ register: 'access-token' });
    render(<RegisterPage />);
    fillForm('test@example.com', 'password123');
    fireEvent.click(screen.getByRole('button', { name: /create account/i }));

    await waitFor(() => {
      expect(mockGqlRequest).toHaveBeenCalledWith(expect.stringContaining('Register'), {
        email: 'test@example.com',
        password: 'password123',
        captchaToken: null,
      });
    });
  });

  it('shows check your email message after successful registration', async () => {
    mockGqlRequest.mockResolvedValue({ register: 'access-token' });
    render(<RegisterPage />);
    fillForm('test@example.com', 'password123');
    fireEvent.click(screen.getByRole('button', { name: /create account/i }));

    await waitFor(() => {
      expect(screen.getByText('Check your email')).toBeInTheDocument();
    });
    expect(screen.getByText(/test@example.com/)).toBeInTheDocument();
  });

  it('gives the spam hint and a resend button once the account is created (JEF-520)', async () => {
    mockGqlRequest.mockResolvedValueOnce({ register: 'access-token' });
    render(<RegisterPage />);
    fillForm('test@example.com', 'password123');
    fireEvent.click(screen.getByRole('button', { name: /create account/i }));

    expect(await screen.findByText(/spam folder/i)).toBeInTheDocument();
    mockGqlRequest.mockResolvedValueOnce({ resendVerificationEmail: true });
    fireEvent.click(screen.getByRole('button', { name: /resend verification email/i }));

    await waitFor(() => {
      expect(mockGqlRequest).toHaveBeenLastCalledWith(
        expect.stringContaining('ResendVerificationEmail'),
      );
    });
    expect(await screen.findByText(/on its way to test@example.com/)).toBeInTheDocument();
  });

  it('says so when the resend is rate limited', async () => {
    mockGqlRequest.mockResolvedValueOnce({ register: 'access-token' });
    render(<RegisterPage />);
    fillForm('test@example.com', 'password123');
    fireEvent.click(screen.getByRole('button', { name: /create account/i }));
    await screen.findByText(/spam folder/i);

    mockGqlRequest.mockRejectedValueOnce(new Error('nope'));
    fireEvent.click(screen.getByRole('button', { name: /resend verification email/i }));

    expect(await screen.findByText(/couldn't send the email/i)).toBeInTheDocument();
  });

  it('sends the signed-in user on to the app, not back to the login page (JEF-438)', async () => {
    // Registering signs the user in, so /login would only bounce them to the
    // app; an unverified account lands on the verification reminder there.
    mockGqlRequest.mockResolvedValue({ register: 'access-token' });
    render(<RegisterPage />);
    fillForm('test@example.com', 'password123');
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
    fillForm('taken@example.com', 'password123');
    fireEvent.click(screen.getByRole('button', { name: /create account/i }));

    await waitFor(() => {
      expect(screen.getByText('Email already registered')).toBeInTheDocument();
    });
    expect(mockNavigate).not.toHaveBeenCalled();
  });

  it('shows generic error when network fails', async () => {
    mockGqlRequest.mockRejectedValue(new Error('network error'));
    render(<RegisterPage />);
    fillForm('test@example.com', 'password123');
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
