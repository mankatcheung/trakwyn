import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const { mockNavigate, mockGqlRequest, mockUseSearch } = vi.hoisted(() => ({
  mockNavigate: vi.fn(),
  mockGqlRequest: vi.fn(),
  mockUseSearch: vi.fn().mockReturnValue({}),
}));

vi.mock('@tanstack/react-router', () => ({
  createFileRoute: () => (opts: object) => ({ ...opts, useSearch: () => ({}) }),
  useNavigate: () => mockNavigate,
  useSearch: mockUseSearch,
  redirect: vi.fn(),
}));

vi.mock('@tanstack/react-start', () => ({
  createServerFn: () => ({ handler: (fn: () => unknown) => fn }),
}));

vi.mock('@tanstack/react-start/server', () => ({
  getCookie: vi.fn(),
}));

vi.mock('#/graphql/client', () => ({
  gqlClient: { request: mockGqlRequest },
}));

vi.mock('#/lib/queryClient', () => ({
  queryClient: { clear: vi.fn(), resetQueries: vi.fn() },
}));

import { ThemeProvider } from '#/lib/theme';
import { SettingsSecurityPage } from '#/features/settings/pages/SettingsSecurityPage';
import { gqlContaining } from '#/__tests__/helpers/gqlText';

const makeClient = () => new QueryClient({ defaultOptions: { queries: { retry: false } } });

function Wrapper({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider>
      <QueryClientProvider client={makeClient()}>{children}</QueryClientProvider>
    </ThemeProvider>
  );
}

const defaultResponse = {
  me: {
    id: 'user-1',
    email: 'test@example.com',
    name: null,
    timezone: null,
    targetRole: null,
    avatarUrl: null,
  },
  sessions: [
    {
      id: 'session-1',
      userAgent: 'Mozilla/5.0 (Macintosh)',
      ipAddress: '10.0.0.1',
      lastUsedAt: '2024-01-01T00:00:00.000Z',
      current: true,
    },
  ],
  securityActivity: [],
  totpEnabled: false,
  linkedOAuthAccounts: [],
};

describe('Settings > Security: email and backup email (JEF-686)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGqlRequest.mockResolvedValue(defaultResponse);
    mockUseSearch.mockReturnValue({});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('email update form', () => {
    it('shows the current email above the change form', async () => {
      render(<SettingsSecurityPage />, { wrapper: Wrapper });

      expect(await screen.findByText('test@example.com')).toBeInTheDocument();
      expect(screen.getByText('Current email')).toBeInTheDocument();
      expect(screen.queryByTestId('current-email-loading')).not.toBeInTheDocument();
    });

    it('shows a loading placeholder instead of the current email while the request is in flight', () => {
      mockGqlRequest.mockReturnValue(new Promise(() => {}));
      render(<SettingsSecurityPage />, { wrapper: Wrapper });

      expect(screen.getByTestId('current-email-loading')).toBeInTheDocument();
      expect(screen.queryByText('test@example.com')).not.toBeInTheDocument();
    });

    it('calls requestEmailChange mutation with current password and new email', async () => {
      render(<SettingsSecurityPage />, { wrapper: Wrapper });
      await waitFor(() => expect(mockGqlRequest).toHaveBeenCalled());
      mockGqlRequest.mockResolvedValue({ requestEmailChange: true });

      const updateEmailBtn = screen.getByRole('button', { name: /update email/i });
      const form = updateEmailBtn.closest('form')!;
      const pwInput = form.querySelector('input[type="password"]')!;
      const emailInput = form.querySelector('input[type="email"]')!;

      fireEvent.change(pwInput, { target: { value: 'mypassword' } });
      fireEvent.change(emailInput, { target: { value: 'new@example.com' } });
      fireEvent.click(updateEmailBtn);

      await waitFor(() => {
        expect(mockGqlRequest).toHaveBeenCalledWith(gqlContaining('RequestEmailChange'), {
          currentPassword: 'mypassword',
          newEmail: 'new@example.com',
        });
      });
    });

    it('shows error message on email update failure', async () => {
      render(<SettingsSecurityPage />, { wrapper: Wrapper });
      await waitFor(() => expect(mockGqlRequest).toHaveBeenCalled());
      mockGqlRequest.mockRejectedValue({
        response: { errors: [{ message: 'Email already in use' }] },
      });

      const updateEmailBtn = screen.getByRole('button', { name: /update email/i });
      const form = updateEmailBtn.closest('form')!;
      const pwInput = form.querySelector('input[type="password"]')!;
      const emailInput = form.querySelector('input[type="email"]')!;

      fireEvent.change(pwInput, { target: { value: 'mypassword' } });
      fireEvent.change(emailInput, { target: { value: 'taken@example.com' } });
      fireEvent.click(updateEmailBtn);

      await waitFor(() => {
        expect(screen.getByText('Email already in use')).toBeInTheDocument();
      });
    });
  });

  describe('backup email', () => {
    it('shows a loading placeholder instead of the add-backup-email form while the request is in flight', () => {
      mockGqlRequest.mockReturnValue(new Promise(() => {}));
      render(<SettingsSecurityPage />, { wrapper: Wrapper });

      expect(screen.queryByRole('button', { name: /add backup email/i })).not.toBeInTheDocument();
    });

    it('shows the add-backup-email form once the me query resolves with none set', async () => {
      render(<SettingsSecurityPage />, { wrapper: Wrapper });

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /add backup email/i })).toBeInTheDocument();
      });
    });
  });

  describe('step-up reauthentication (JEF-44)', () => {
    const stepUpRequiredError = {
      response: {
        errors: [
          {
            message: 'Please verify your identity again to continue.',
            extensions: { code: 'STEP_UP_REQUIRED' },
          },
        ],
      },
    };

    it('prompts for reauth on STEP_UP_REQUIRED, then retries the original mutation on success', async () => {
      render(<SettingsSecurityPage />, { wrapper: Wrapper });
      await waitFor(() => expect(mockGqlRequest).toHaveBeenCalled());

      mockGqlRequest.mockRejectedValueOnce(stepUpRequiredError);
      // The dialog asks how this user can step up before it opens (JEF-463).
      mockGqlRequest.mockResolvedValueOnce({ me: { stepUpMethods: ['password'] } });
      mockGqlRequest.mockResolvedValueOnce({
        reauthenticate: { success: true, totpRequired: false, accessToken: 'new-access-token' },
      });
      mockGqlRequest.mockResolvedValueOnce({ requestEmailChange: true });

      const updateEmailBtn = screen.getByRole('button', { name: /update email/i });
      const form = updateEmailBtn.closest('form')!;
      fireEvent.change(form.querySelector('input[type="password"]')!, {
        target: { value: 'mypassword' },
      });
      fireEvent.change(form.querySelector('input[type="email"]')!, {
        target: { value: 'new@example.com' },
      });
      fireEvent.click(updateEmailBtn);

      await waitFor(() => {
        expect(screen.getByText("Confirm it's you")).toBeInTheDocument();
      });

      const dialog = screen.getByText("Confirm it's you").closest('div')!.parentElement!;
      fireEvent.change(dialog.querySelector('input[type="password"]')!, {
        target: { value: 'mypassword' },
      });
      fireEvent.click(screen.getByRole('button', { name: /^confirm$/i }));

      await waitFor(() => {
        expect(mockGqlRequest).toHaveBeenCalledWith(gqlContaining('Reauthenticate'), {
          password: 'mypassword',
          code: undefined,
        });
      });
      await waitFor(() => {
        expect(screen.queryByText("Confirm it's you")).not.toBeInTheDocument();
      });
      expect(mockGqlRequest).toHaveBeenCalledWith(gqlContaining('RequestEmailChange'), {
        currentPassword: 'mypassword',
        newEmail: 'new@example.com',
      });
    });

    it('dismisses silently when the reauth dialog is cancelled', async () => {
      render(<SettingsSecurityPage />, { wrapper: Wrapper });
      await waitFor(() => expect(mockGqlRequest).toHaveBeenCalled());

      mockGqlRequest.mockRejectedValueOnce(stepUpRequiredError);

      const updateEmailBtn = screen.getByRole('button', { name: /update email/i });
      const form = updateEmailBtn.closest('form')!;
      fireEvent.change(form.querySelector('input[type="password"]')!, {
        target: { value: 'mypassword' },
      });
      fireEvent.change(form.querySelector('input[type="email"]')!, {
        target: { value: 'new@example.com' },
      });
      fireEvent.click(updateEmailBtn);

      await waitFor(() => {
        expect(screen.getByText("Confirm it's you")).toBeInTheDocument();
      });

      fireEvent.click(screen.getByRole('button', { name: /^cancel$/i }));

      await waitFor(() => {
        expect(screen.queryByText("Confirm it's you")).not.toBeInTheDocument();
      });
      expect(screen.queryByText('Failed to update email.')).not.toBeInTheDocument();
    });
  });

  describe('an account without a password (JEF-463)', () => {
    it('hides the password fields and sends no password when changing the email', async () => {
      mockGqlRequest.mockResolvedValue({ me: { ...defaultResponse.me, hasPassword: false } });
      render(<SettingsSecurityPage />, { wrapper: Wrapper });

      const updateEmailBtn = await screen.findByRole('button', { name: /update email/i });
      const form = updateEmailBtn.closest('form')!;
      await waitFor(() => expect(form.querySelector('input[type="password"]')).toBeNull());

      mockGqlRequest.mockResolvedValueOnce({ requestEmailChange: true });
      fireEvent.change(form.querySelector('input[type="email"]')!, {
        target: { value: 'new@example.com' },
      });
      fireEvent.click(updateEmailBtn);

      await waitFor(() =>
        expect(mockGqlRequest).toHaveBeenCalledWith(gqlContaining('RequestEmailChange'), {
          newEmail: 'new@example.com',
          currentPassword: null,
        }),
      );
    });
  });
});
