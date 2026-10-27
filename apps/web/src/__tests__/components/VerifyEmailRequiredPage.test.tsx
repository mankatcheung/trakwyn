import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const { mockNavigate, mockGqlRequest, mockClearQueries, verification } = vi.hoisted(() => ({
  mockNavigate: vi.fn(),
  mockGqlRequest: vi.fn(),
  mockClearQueries: vi.fn(),
  // What the `me` check answers; tests flip it to simulate verifying elsewhere.
  verification: { emailVerified: false },
}));

vi.mock('@tanstack/react-router', () => ({
  createFileRoute: () => (opts: object) => opts,
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
  hasSessionCookie: vi.fn().mockReturnValue(true),
}));

vi.mock('#/lib/queryClient', () => ({
  queryClient: { clear: mockClearQueries },
}));

import type { ComponentType } from 'react';
import { Route } from '#/routes/verify-email-required';
import { RESEND_COOLDOWN_SECONDS } from '#/lib/emailVerification';

const VerifyEmailRequiredRoute = (Route as unknown as { component: ComponentType }).component;

const renderGate = () =>
  render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <VerifyEmailRequiredRoute />
    </QueryClientProvider>,
  );

const waitForWall = () => screen.findByRole('heading', { name: 'Verify your email to continue' });

const requestsMatching = (fragment: string) =>
  mockGqlRequest.mock.calls.filter(([query]) => String(query).includes(fragment));

describe('verification wall (JEF-438)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    verification.emailVerified = false;
    mockGqlRequest.mockImplementation(async (query: string) => {
      if (query.includes('EmailVerification')) {
        return { me: { email: 'new@example.com', emailVerified: verification.emailVerified } };
      }
      if (query.includes('ResendVerificationEmail')) return { resendVerificationEmail: true };
      if (query.includes('RequestEmailChange')) return { requestEmailChange: true };
      return {};
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('shows the full-page reminder with the address the link went to', async () => {
    renderGate();

    await waitForWall();
    // In the app the guard has already put the answer in the cache; here it
    // arrives a moment after the first paint.
    expect(await screen.findByText(/new@example\.com/)).toBeInTheDocument();
    expect(mockNavigate).not.toHaveBeenCalled();
  });

  it('sends a verified user on to the app', async () => {
    verification.emailVerified = true;
    renderGate();

    await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith({ to: '/dashboard' }));
    expect(requestsMatching('EmailVerification')).toHaveLength(1);
  });

  describe('resend', () => {
    it('sends a new link, confirms it, and holds the button for the cooldown', async () => {
      vi.useFakeTimers({ shouldAdvanceTime: true });
      renderGate();
      await waitForWall();

      fireEvent.click(screen.getByRole('button', { name: 'Resend verification email' }));

      expect(await screen.findByText('A new link is on its way to new@example.com.')).toBeVisible();
      expect(requestsMatching('ResendVerificationEmail')).toHaveLength(1);
      const waiting = screen.getByRole('button', {
        name: `Resend in ${RESEND_COOLDOWN_SECONDS}s`,
      });
      expect(waiting).toBeDisabled();

      await act(async () => {
        await vi.advanceTimersByTimeAsync(RESEND_COOLDOWN_SECONDS * 1000);
      });
      expect(screen.getByRole('button', { name: 'Resend verification email' })).toBeEnabled();
    });

    it('says to wait when the API rate-limits the resend', async () => {
      renderGate();
      await waitForWall();
      mockGqlRequest.mockImplementation(async (query: string) => {
        if (query.includes('ResendVerificationEmail')) {
          throw {
            response: {
              errors: [
                { message: 'Too many verification emails.', extensions: { code: 'RATE_LIMITED' } },
              ],
            },
          };
        }
        return { me: { email: 'new@example.com', emailVerified: false } };
      });

      fireEvent.click(screen.getByRole('button', { name: 'Resend verification email' }));

      expect(await screen.findByText(/wait a few minutes before trying again/i)).toBeVisible();
      expect(screen.getByRole('button', { name: 'Resend verification email' })).toBeEnabled();
    });

    it('shows a generic failure for any other error', async () => {
      renderGate();
      await waitForWall();
      mockGqlRequest.mockRejectedValue(new Error('boom'));

      fireEvent.click(screen.getByRole('button', { name: 'Resend verification email' }));

      expect(
        await screen.findByText("We couldn't send the email. Please try again."),
      ).toBeVisible();
    });

    it('tells the user to check spam', async () => {
      renderGate();
      await waitForWall();

      expect(screen.getByText(/check your spam folder/i)).toBeVisible();
    });
  });

  describe('checking again', () => {
    it('says so when the email is still not verified', async () => {
      renderGate();
      await waitForWall();

      fireEvent.click(screen.getByRole('button', { name: "I've verified my email" }));

      expect(await screen.findByText(/isn't verified yet/i)).toBeVisible();
    });

    it('sends the user to the app once the email has been verified elsewhere', async () => {
      renderGate();
      await waitForWall();
      verification.emailVerified = true;

      fireEvent.click(screen.getByRole('button', { name: "I've verified my email" }));

      await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith({ to: '/dashboard' }));
    });
  });

  describe('using a different email', () => {
    const openForm = async () => {
      renderGate();
      await waitForWall();
      fireEvent.click(screen.getByRole('button', { name: 'Wrong address? Use a different email' }));
    };

    it('sends the new address and the password to the email-change mutation', async () => {
      await openForm();

      fireEvent.change(screen.getByLabelText('New email'), {
        target: { value: 'right@example.com' },
      });
      fireEvent.change(screen.getByLabelText('Current password'), {
        target: { value: 'hunter2hunter2' },
      });
      fireEvent.click(screen.getByRole('button', { name: 'Send link to this address' }));

      expect(
        await screen.findByText('Check right@example.com for a link to confirm the new address.'),
      ).toBeVisible();
      expect(mockGqlRequest).toHaveBeenCalledWith(expect.stringContaining('RequestEmailChange'), {
        currentPassword: 'hunter2hunter2',
        newEmail: 'right@example.com',
      });
    });

    it("shows the server's message when the change is refused", async () => {
      await openForm();
      mockGqlRequest.mockRejectedValue({ response: { errors: [{ message: 'Invalid password' }] } });

      fireEvent.change(screen.getByLabelText('New email'), {
        target: { value: 'right@example.com' },
      });
      fireEvent.change(screen.getByLabelText('Current password'), { target: { value: 'wrong' } });
      fireEvent.click(screen.getByRole('button', { name: 'Send link to this address' }));

      expect(await screen.findByText('Invalid password')).toBeVisible();
    });

    it('closes the form on cancel', async () => {
      await openForm();

      fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));

      expect(screen.queryByLabelText('New email')).not.toBeInTheDocument();
    });
  });

  it('signs out, clears cached data and goes to the login page', async () => {
    renderGate();
    await waitForWall();

    fireEvent.click(screen.getByRole('button', { name: 'Sign out' }));

    await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith({ to: '/login' }));
    expect(requestsMatching('logout')).toHaveLength(1);
    expect(mockClearQueries).toHaveBeenCalled();
  });
});
