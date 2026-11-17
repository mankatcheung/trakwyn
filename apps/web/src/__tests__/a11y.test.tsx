import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { axe } from 'jest-axe';

/* ------------------------------------------------------------------ */
/*  Shared mocks — reused across every component under test            */
/* ------------------------------------------------------------------ */

const { mockNavigate, mockGqlRequest, mockUseSearch } = vi.hoisted(() => ({
  mockNavigate: vi.fn(),
  mockGqlRequest: vi.fn(),
  mockUseSearch: vi.fn().mockReturnValue({}),
}));

vi.mock('@tanstack/react-router', () => ({
  createFileRoute: () => (opts: unknown) => ({ ...(opts as object), useSearch: mockUseSearch }),
  useNavigate: () => mockNavigate,
  useSearch: () => mockUseSearch(),
  useRouterState: ({ select }: { select: (s: { location: { pathname: string } }) => string }) =>
    select({ location: { pathname: '/dashboard' } }),
  useChildMatches: () => [{ routeId: '/_authenticated/dashboard' }],
  redirect: vi.fn(),
  Outlet: () => <div data-testid="outlet" />,
  Link: ({
    children,
    to,
    ...rest
  }: { children: React.ReactNode; to: string } & Record<string, unknown>) => (
    <a href={to} {...rest}>
      {children}
    </a>
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
  queryClient: { clear: vi.fn(), resetQueries: vi.fn() },
}));

vi.mock('@vercel/blob/client', () => ({
  put: vi.fn(),
}));

/* ------------------------------------------------------------------ */
/*  Helpers                                                           */
/* ------------------------------------------------------------------ */

const makeClient = () => new QueryClient({ defaultOptions: { queries: { retry: false } } });

function Wrapper({ children }: { children: React.ReactNode }) {
  return <QueryClientProvider client={makeClient()}>{children}</QueryClientProvider>;
}

async function checkA11y(
  ui: React.ReactElement,
  wrapper?: React.ComponentType<{ children: React.ReactNode }>,
) {
  const { container } = render(ui, {
    wrapper: (wrapper ?? Wrapper) as React.ComponentType<{ children: React.ReactNode }>,
  });
  const results = await axe(container);
  expect(results).toHaveNoViolations();
}

/* ------------------------------------------------------------------ */
/*  Tests                                                             */
/* ------------------------------------------------------------------ */

describe('Accessibility audits', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseSearch.mockReturnValue({});
  });

  /* ---- public pages ------------------------------------------------ */

  describe('LoginPage', () => {
    it('has no detectable a11y violations', async () => {
      const { LoginPage } = await import('#/features/auth/pages/LoginPage');
      await checkA11y(<LoginPage />);
    });
  });

  describe('RegisterPage', () => {
    it('has no detectable a11y violations', async () => {
      const { RegisterPage } = await import('#/features/auth/pages/RegisterPage');
      await checkA11y(<RegisterPage />);
    });
  });

  describe('ForgotPasswordPage', () => {
    it('has no detectable a11y violations', async () => {
      const { ForgotPasswordPage } = await import('#/features/auth/pages/ForgotPasswordPage');
      await checkA11y(<ForgotPasswordPage />);
    });
  });

  describe('ResetPasswordPage', () => {
    it('has no detectable a11y violations', async () => {
      mockUseSearch.mockReturnValue({ token: 'valid-token' });
      const { ResetPasswordPage } = await import('#/features/auth/pages/ResetPasswordPage');
      await checkA11y(<ResetPasswordPage />);
    });
  });

  /* ---- authenticated pages ----------------------------------------- */

  describe('AuthenticatedLayout', () => {
    it('has no detectable a11y violations', async () => {
      mockGqlRequest.mockResolvedValue({ me: { avatarUrl: null } });
      const { ThemeProvider } = await import('#/lib/theme');
      const { AuthenticatedLayout } =
        await import('#/features/app-shell/components/AuthenticatedLayout');

      function AuthWrapper({ children }: { children: React.ReactNode }) {
        return (
          <ThemeProvider>
            <QueryClientProvider client={makeClient()}>{children}</QueryClientProvider>
          </ThemeProvider>
        );
      }

      await checkA11y(<AuthenticatedLayout />, AuthWrapper);
    });
  });

  describe('DashboardPage', () => {
    it('has no detectable a11y violations', async () => {
      mockGqlRequest.mockResolvedValue({ applications: [] });
      const { DashboardPage } = await import('#/features/dashboard/pages/DashboardPage');
      await checkA11y(<DashboardPage />);
    });
  });

  describe('SettingsNotificationsPage', () => {
    it('has no detectable a11y violations', async () => {
      mockGqlRequest.mockResolvedValue({
        me: {
          id: 'user-1',
          email: 'test@example.com',
          name: null,
          timezone: null,
          targetRole: null,
          avatarUrl: null,
        },
        notificationPreferences: {
          weeklyDigestEnabled: true,
          followUpRemindersEnabled: true,
          pushNotificationsEnabled: false,
        },
      });
      const { ThemeProvider } = await import('#/lib/theme');
      const { SettingsNotificationsPage } =
        await import('#/routes/_authenticated/settings/-components/SettingsNotificationsPage');

      function SettingsWrapper({ children }: { children: React.ReactNode }) {
        return (
          <ThemeProvider>
            <QueryClientProvider client={makeClient()}>{children}</QueryClientProvider>
          </ThemeProvider>
        );
      }

      await checkA11y(<SettingsNotificationsPage />, SettingsWrapper);
    });
  });
});
