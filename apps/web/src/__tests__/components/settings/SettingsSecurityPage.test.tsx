import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const { mockNavigate, mockGqlRequest, mockPutBlob, mockUseSearch } = vi.hoisted(() => ({
  mockNavigate: vi.fn(),
  mockGqlRequest: vi.fn(),
  mockPutBlob: vi.fn(),
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

vi.mock('@vercel/blob/client', () => ({
  put: mockPutBlob,
}));

import { ThemeProvider } from '#/lib/theme';
import { SettingsSecurityPage } from '#/routes/_authenticated/settings/-components/SettingsSecurityPage';

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

describe('SettingsSecurityPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGqlRequest.mockResolvedValue(defaultResponse);
    mockUseSearch.mockReturnValue({});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('password update form', () => {
    it('shows validation error when new passwords do not match', async () => {
      render(<SettingsSecurityPage />, { wrapper: Wrapper });

      const updatePasswordBtn = screen.getByRole('button', { name: /update password/i });
      const form = updatePasswordBtn.closest('form')!;
      const inputs = form.querySelectorAll('input[type="password"]');

      fireEvent.change(inputs[0], { target: { value: 'currentPass1' } });
      fireEvent.change(inputs[1], { target: { value: 'newPass1234' } });
      fireEvent.change(inputs[2], { target: { value: 'differentPass' } });
      fireEvent.click(updatePasswordBtn);

      await waitFor(() => {
        expect(screen.getByText('Passwords do not match')).toBeInTheDocument();
      });
      expect(mockGqlRequest).not.toHaveBeenCalledWith(
        expect.stringContaining('UpdatePassword'),
        expect.anything(),
      );
    });

    it('calls updatePassword mutation with matching passwords', async () => {
      render(<SettingsSecurityPage />, { wrapper: Wrapper });
      await waitFor(() => expect(mockGqlRequest).toHaveBeenCalled());
      mockGqlRequest.mockResolvedValue({ updatePassword: true });

      const updatePasswordBtn = screen.getByRole('button', { name: /update password/i });
      const form = updatePasswordBtn.closest('form')!;
      const inputs = form.querySelectorAll('input[type="password"]');

      fireEvent.change(inputs[0], { target: { value: 'currentPass1' } });
      fireEvent.change(inputs[1], { target: { value: 'newPass1234' } });
      fireEvent.change(inputs[2], { target: { value: 'newPass1234' } });
      fireEvent.click(updatePasswordBtn);

      await waitFor(() => {
        expect(mockGqlRequest).toHaveBeenCalledWith(expect.stringContaining('UpdatePassword'), {
          currentPassword: 'currentPass1',
          newPassword: 'newPass1234',
        });
      });
    });

    it('shows generic error message when password update fails', async () => {
      render(<SettingsSecurityPage />, { wrapper: Wrapper });
      await waitFor(() => expect(mockGqlRequest).toHaveBeenCalled());
      mockGqlRequest.mockRejectedValue(new Error('network error'));

      const updatePasswordBtn = screen.getByRole('button', { name: /update password/i });
      const form = updatePasswordBtn.closest('form')!;
      const inputs = form.querySelectorAll('input[type="password"]');

      fireEvent.change(inputs[0], { target: { value: 'currentPass1' } });
      fireEvent.change(inputs[1], { target: { value: 'newPass1234' } });
      fireEvent.change(inputs[2], { target: { value: 'newPass1234' } });
      fireEvent.click(updatePasswordBtn);

      await waitFor(() => {
        expect(screen.getByText('Failed to update password.')).toBeInTheDocument();
      });
    });
  });

  describe('two-factor authentication', () => {
    it('shows a loading placeholder instead of the Enable 2FA form while the request is in flight', () => {
      mockGqlRequest.mockReturnValue(new Promise(() => {}));
      render(<SettingsSecurityPage />, { wrapper: Wrapper });

      expect(screen.queryByRole('button', { name: /enable 2fa/i })).not.toBeInTheDocument();
    });

    it('shows an "Enable 2FA" button when disabled', async () => {
      render(<SettingsSecurityPage />, { wrapper: Wrapper });
      await waitFor(() => {
        expect(screen.getByRole('button', { name: /enable 2fa/i })).toBeInTheDocument();
      });
    });

    it('starts setup, shows the QR code and secret, and confirms with a code', async () => {
      render(<SettingsSecurityPage />, { wrapper: Wrapper });
      await waitFor(() => expect(mockGqlRequest).toHaveBeenCalled());

      const setupData = {
        beginTotpSetup: {
          secret: 'ABCD1234',
          otpauthUrl: 'otpauth://totp/Job%20Finder:test@example.com?secret=ABCD1234',
          qrCodeDataUrl: 'data:image/png;base64,abc123',
        },
      };
      mockGqlRequest.mockResolvedValueOnce(setupData);
      const enableBtn = screen.getByRole('button', { name: /enable 2fa/i });
      const beginForm = enableBtn.closest('form')!;
      const beginPasswordInput = beginForm.querySelector('input[type="password"]')!;
      fireEvent.change(beginPasswordInput, { target: { value: 'mypassword' } });
      fireEvent.click(enableBtn);

      await waitFor(() => {
        expect(mockGqlRequest).toHaveBeenCalledWith(expect.stringContaining('BeginTotpSetup'), {
          password: 'mypassword',
        });
      });
      await waitFor(() => {
        expect(screen.getByAltText('Two-factor authentication QR code')).toHaveAttribute(
          'src',
          setupData.beginTotpSetup.qrCodeDataUrl,
        );
      });
      expect(screen.getByText('ABCD1234')).toBeInTheDocument();

      const backupCodes = ['aaaa1111bbbb2222', 'cccc3333dddd4444'];
      mockGqlRequest.mockResolvedValueOnce({ confirmTotpSetup: { backupCodes } });
      fireEvent.change(screen.getByPlaceholderText('123456'), { target: { value: '654321' } });
      fireEvent.click(screen.getByRole('button', { name: /^confirm$/i }));

      await waitFor(() => {
        expect(mockGqlRequest).toHaveBeenCalledWith(expect.stringContaining('ConfirmTotpSetup'), {
          code: '654321',
        });
      });
      await waitFor(() => {
        backupCodes.forEach((code) => expect(screen.getByText(code)).toBeInTheDocument());
      });
    });

    it('shows a disable form when 2FA is already enabled', async () => {
      mockGqlRequest.mockResolvedValue({ ...defaultResponse, totpEnabled: true });
      render(<SettingsSecurityPage />, { wrapper: Wrapper });

      await waitFor(() => {
        expect(screen.getByText('Two-factor authentication is enabled.')).toBeInTheDocument();
      });

      mockGqlRequest.mockResolvedValueOnce({ disableTotp: true });
      const disableBtn = screen.getByRole('button', { name: /disable 2fa/i });
      const form = disableBtn.closest('form')!;
      const passwordInput = form.querySelector('input[type="password"]')!;
      fireEvent.change(passwordInput, { target: { value: 'mypassword' } });
      fireEvent.click(disableBtn);

      await waitFor(() => {
        expect(mockGqlRequest).toHaveBeenCalledWith(expect.stringContaining('DisableTotp'), {
          password: 'mypassword',
        });
      });
    });
  });

  describe('active sessions', () => {
    it('shows the current session without a revoke button', async () => {
      render(<SettingsSecurityPage />, { wrapper: Wrapper });

      await waitFor(() => {
        expect(screen.getByText('Mozilla/5.0 (Macintosh)')).toBeInTheDocument();
      });
      expect(screen.getByText('This device')).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /revoke session/i })).not.toBeInTheDocument();
      expect(
        screen.queryByRole('button', { name: /sign out other sessions/i }),
      ).not.toBeInTheDocument();
    });

    it('shows a revoke button for non-current sessions and calls revokeSession', async () => {
      mockGqlRequest.mockResolvedValue({
        ...defaultResponse,
        sessions: [
          {
            id: 'session-1',
            userAgent: 'Chrome',
            ipAddress: '1.1.1.1',
            lastUsedAt: '2024-01-01T00:00:00.000Z',
            current: true,
          },
          {
            id: 'session-2',
            userAgent: 'Safari',
            ipAddress: '2.2.2.2',
            lastUsedAt: '2024-01-02T00:00:00.000Z',
            current: false,
          },
        ],
      });
      render(<SettingsSecurityPage />, { wrapper: Wrapper });
      await waitFor(() => expect(screen.getByText('Safari')).toBeInTheDocument());

      mockGqlRequest.mockResolvedValueOnce({ revokeSession: true });
      fireEvent.click(screen.getByRole('button', { name: /revoke session/i }));

      await waitFor(() => {
        expect(mockGqlRequest).toHaveBeenCalledWith(expect.stringContaining('RevokeSession'), {
          id: 'session-2',
        });
      });
    });

    it('shows "Sign out other sessions" when there is more than one session', async () => {
      mockGqlRequest.mockResolvedValue({
        ...defaultResponse,
        sessions: [
          {
            id: 'session-1',
            userAgent: 'Chrome',
            ipAddress: '1.1.1.1',
            lastUsedAt: '2024-01-01T00:00:00.000Z',
            current: true,
          },
          {
            id: 'session-2',
            userAgent: 'Safari',
            ipAddress: '2.2.2.2',
            lastUsedAt: '2024-01-02T00:00:00.000Z',
            current: false,
          },
        ],
      });
      render(<SettingsSecurityPage />, { wrapper: Wrapper });
      await waitFor(() =>
        expect(
          screen.getByRole('button', { name: /sign out other sessions/i }),
        ).toBeInTheDocument(),
      );

      mockGqlRequest.mockResolvedValueOnce({ revokeOtherSessions: true });
      fireEvent.click(screen.getByRole('button', { name: /sign out other sessions/i }));

      await waitFor(() => {
        expect(mockGqlRequest).toHaveBeenCalledWith(expect.stringContaining('RevokeOtherSessions'));
      });
    });
  });

  describe('security activity', () => {
    it('renders a login event with device and IP', async () => {
      mockGqlRequest.mockImplementation((query: unknown) => {
        if (typeof query === 'string' && query.includes('SecurityActivity')) {
          return Promise.resolve({
            securityActivity: [
              {
                id: 'event-1',
                eventType: 'login',
                ipAddress: '203.0.113.5',
                userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)',
                createdAt: '2024-01-01T00:00:00.000Z',
              },
            ],
          });
        }
        return Promise.resolve(defaultResponse);
      });

      render(<SettingsSecurityPage />, { wrapper: Wrapper });

      await waitFor(() => {
        expect(screen.getByText('Signed in')).toBeInTheDocument();
        expect(screen.getByText(/Mac · 203.0.113.5/)).toBeInTheDocument();
      });
    });

    it('renders a non-login security event with its label', async () => {
      mockGqlRequest.mockImplementation((query: unknown) => {
        if (typeof query === 'string' && query.includes('SecurityActivity')) {
          return Promise.resolve({
            securityActivity: [
              {
                id: 'event-1',
                eventType: 'password_changed',
                ipAddress: '203.0.113.5',
                userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)',
                createdAt: '2024-01-01T00:00:00.000Z',
              },
            ],
          });
        }
        return Promise.resolve(defaultResponse);
      });

      render(<SettingsSecurityPage />, { wrapper: Wrapper });

      await waitFor(() => {
        expect(screen.getByText('Password changed')).toBeInTheDocument();
      });
    });

    it('shows a message when there is no security activity', async () => {
      render(<SettingsSecurityPage />, { wrapper: Wrapper });

      await waitFor(() => {
        expect(screen.getByText('No security activity yet.')).toBeInTheDocument();
      });
    });

    it('shows an error message when security activity fails to load', async () => {
      mockGqlRequest.mockImplementation((query: unknown) => {
        if (typeof query === 'string' && query.includes('SecurityActivity')) {
          return Promise.reject(new Error('network error'));
        }
        return Promise.resolve(defaultResponse);
      });

      render(<SettingsSecurityPage />, { wrapper: Wrapper });

      await waitFor(() => {
        expect(screen.getByText('Failed to load security activity.')).toBeInTheDocument();
      });
    });
  });

  describe('linked accounts', () => {
    it('shows a loading placeholder instead of "not linked" while the request is in flight', () => {
      mockGqlRequest.mockReturnValue(new Promise(() => {}));
      render(<SettingsSecurityPage />, { wrapper: Wrapper });

      expect(screen.queryByRole('link', { name: /^link$/i })).not.toBeInTheDocument();
    });

    it('shows both providers as not linked, with a Link link to the start route', async () => {
      render(<SettingsSecurityPage />, { wrapper: Wrapper });
      await waitFor(() => expect(mockGqlRequest).toHaveBeenCalled());

      const links = screen.getAllByRole('link', { name: /^link$/i });
      const hrefs = links.map((l) => l.getAttribute('href')).sort();
      expect(hrefs).toEqual([
        '/auth/oauth/github/start?mode=link',
        '/auth/oauth/google/start?mode=link',
      ]);
    });

    it('shows a linked provider with its email and an Unlink button', async () => {
      mockGqlRequest.mockResolvedValue({
        ...defaultResponse,
        linkedOAuthAccounts: [
          { provider: 'google', email: 'jeff@example.com', createdAt: '2024-01-01T00:00:00.000Z' },
        ],
      });
      render(<SettingsSecurityPage />, { wrapper: Wrapper });

      await waitFor(() => {
        expect(screen.getByText('jeff@example.com')).toBeInTheDocument();
      });
      expect(screen.getByRole('button', { name: /unlink/i })).toBeInTheDocument();
    });

    it('calls unlinkOAuthAccount when Unlink is clicked', async () => {
      mockGqlRequest.mockResolvedValue({
        ...defaultResponse,
        linkedOAuthAccounts: [
          { provider: 'google', email: 'jeff@example.com', createdAt: '2024-01-01T00:00:00.000Z' },
        ],
      });
      render(<SettingsSecurityPage />, { wrapper: Wrapper });
      await waitFor(() => screen.getByRole('button', { name: /unlink/i }));

      fireEvent.click(screen.getByRole('button', { name: /unlink/i }));

      await waitFor(() => {
        expect(mockGqlRequest).toHaveBeenCalledWith(expect.stringContaining('UnlinkOAuthAccount'), {
          provider: 'google',
        });
      });
    });

    it('shows a success message when redirected back with ?oauthLinked=<provider>', async () => {
      mockUseSearch.mockReturnValue({ oauthLinked: 'github' });
      render(<SettingsSecurityPage />, { wrapper: Wrapper });

      await waitFor(() => {
        expect(screen.getByText('GitHub account linked successfully.')).toBeInTheDocument();
      });
    });

    it('translates the oauthError slug redirected back from the callback', async () => {
      mockUseSearch.mockReturnValue({ oauthError: 'already_linked' });
      render(<SettingsSecurityPage />, { wrapper: Wrapper });

      await waitFor(() => {
        expect(screen.getByText(/already linked to another user/i)).toBeInTheDocument();
      });
      expect(screen.queryByText('already_linked')).not.toBeInTheDocument();
    });

    it('renders the Google and GitHub logos next to each provider row', async () => {
      render(<SettingsSecurityPage />, { wrapper: Wrapper });
      await waitFor(() => expect(mockGqlRequest).toHaveBeenCalled());

      const rows = screen
        .getAllByRole('link', { name: /^link$/i })
        .map((l) => l.closest('div')!.parentElement!);
      expect(rows).toHaveLength(2);
      const logos = document.querySelectorAll('svg[aria-hidden="true"]');
      expect(logos.length).toBeGreaterThanOrEqual(2);
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

    it('shows a two-factor code field when reauthenticate reports totpRequired', async () => {
      render(<SettingsSecurityPage />, { wrapper: Wrapper });
      await waitFor(() => expect(mockGqlRequest).toHaveBeenCalled());

      mockGqlRequest.mockRejectedValueOnce(stepUpRequiredError);

      const updatePasswordBtn = screen.getByRole('button', { name: /update password/i });
      const form = updatePasswordBtn.closest('form')!;
      const inputs = form.querySelectorAll('input[type="password"]');
      fireEvent.change(inputs[0], { target: { value: 'currentPass1' } });
      fireEvent.change(inputs[1], { target: { value: 'newPass1234' } });
      fireEvent.change(inputs[2], { target: { value: 'newPass1234' } });
      fireEvent.click(updatePasswordBtn);

      await waitFor(() => {
        expect(screen.getByText("Confirm it's you")).toBeInTheDocument();
      });

      mockGqlRequest.mockResolvedValueOnce({
        reauthenticate: { success: false, totpRequired: true, accessToken: null },
      });
      const dialog = screen.getByText("Confirm it's you").closest('div')!.parentElement!;
      fireEvent.change(dialog.querySelector('input[type="password"]')!, {
        target: { value: 'currentPass1' },
      });
      fireEvent.click(screen.getByRole('button', { name: /^confirm$/i }));

      await waitFor(() => {
        expect(screen.getByPlaceholderText('123456')).toBeInTheDocument();
      });
      expect(mockGqlRequest).toHaveBeenCalledWith(expect.stringContaining('UpdatePassword'), {
        currentPassword: 'currentPass1',
        newPassword: 'newPass1234',
      });
    });
  });
});
