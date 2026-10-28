import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const { mockNavigate, mockGqlRequest, mockPathname, mockSearch } = vi.hoisted(() => ({
  mockNavigate: vi.fn(),
  mockGqlRequest: vi.fn().mockResolvedValue({ me: { avatarUrl: null } }),
  // Mutable so individual tests can stand inside the assistant section and
  // assert on its conversation subitems.
  mockPathname: vi.fn(() => '/'),
  mockSearch: vi.fn(() => ({})),
}));

vi.mock('@tanstack/react-router', () => ({
  createFileRoute: () => (opts: unknown) => opts,
  useNavigate: () => mockNavigate,
  useRouterState: ({
    select,
  }: {
    select: (s: { location: { pathname: string; search: unknown } }) => unknown;
  }) =>
    select({
      location: {
        pathname: mockPathname(),
        search: mockSearch(),
      },
    }),
  useChildMatches: () => [{ routeId: '/_authenticated/dashboard' }],
  redirect: vi.fn(),
  Outlet: () => <div data-testid="outlet" />,
  Link: ({
    children,
    to,
    ...rest
  }: {
    children: React.ReactNode;
    to: string;
    [key: string]: unknown;
  }) => (
    // Forward every prop: the assistant subitems carry aria-current and
    // onClick that tests assert on.
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
  hasSessionCookie: vi.fn().mockReturnValue(true),
}));

vi.mock('#/lib/queryClient', () => ({
  queryClient: { clear: vi.fn() },
}));

import { ThemeProvider } from '#/lib/theme';
import { AuthenticatedLayout } from '#/routes/_authenticated/-components/AuthenticatedLayout';

const makeClient = () => new QueryClient({ defaultOptions: { queries: { retry: false } } });

function Wrapper({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider>
      <QueryClientProvider client={makeClient()}>{children}</QueryClientProvider>
    </ThemeProvider>
  );
}

describe('AuthenticatedLayout', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // clearAllMocks resets implementations recorded on these; restore the
    // defaults the suite expects.
    mockPathname.mockReturnValue('/');
    mockSearch.mockReturnValue({});
    mockGqlRequest.mockResolvedValue({ me: { avatarUrl: null } });
  });

  it('renders navigation links', () => {
    render(<AuthenticatedLayout />, { wrapper: Wrapper });
    // "Trakwyn" appears in both mobile header and desktop sidebar
    expect(screen.getAllByText('Trakwyn').length).toBeGreaterThanOrEqual(1);
    // "Dashboard" / "Account" appear in sidebar and bottom nav
    expect(screen.getAllByText('Dashboard').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('Settings').length).toBeGreaterThanOrEqual(1);
    // "Applications" appears in mobile sidebar drawer and desktop sidebar (bottom nav shows "Apps")
    expect(screen.getAllByText('Applications').length).toBeGreaterThanOrEqual(1);
  });

  it('links the CV profile from the main nav rather than from Settings', () => {
    render(<AuthenticatedLayout />, { wrapper: Wrapper });
    // Open the drawer too, so its Settings sub-nav is in the document.
    fireEvent.click(screen.getByRole('button', { name: /open menu/i }));

    const profileLinks = screen.getAllByRole('link', { name: 'My profile' });
    expect(profileLinks.length).toBeGreaterThanOrEqual(1);
    for (const link of profileLinks) expect(link).toHaveAttribute('href', '/profile');
    expect(document.querySelector('a[href="/settings/experience"]')).toBeNull();
  });

  it('renders the Outlet for page content', () => {
    render(<AuthenticatedLayout />, { wrapper: Wrapper });
    expect(screen.getByTestId('outlet')).toBeInTheDocument();
  });

  it('renders a sign out button', () => {
    render(<AuthenticatedLayout />, { wrapper: Wrapper });
    const signOutBtns = screen.getAllByRole('button', { name: /sign out/i });
    expect(signOutBtns.length).toBeGreaterThanOrEqual(1);
    expect(screen.getByTestId('desktop-sidebar-logout')).toBeInTheDocument();
  });

  it('renders logout in the mobile sidebar drawer', () => {
    render(<AuthenticatedLayout />, { wrapper: Wrapper });

    fireEvent.click(screen.getByRole('button', { name: /open menu/i }));

    expect(screen.getByTestId('mobile-sidebar-logout')).toBeInTheDocument();
  });

  it('calls logout mutation and navigates to /login on sign out', async () => {
    mockGqlRequest.mockResolvedValue({ logout: true });
    render(<AuthenticatedLayout />, { wrapper: Wrapper });

    // Click the first sign-out button (mobile sidebar drawer)
    fireEvent.click(screen.getAllByRole('button', { name: /sign out/i })[0]);

    await waitFor(() => {
      expect(mockGqlRequest).toHaveBeenCalledWith(expect.stringContaining('logout'));
      expect(mockNavigate).toHaveBeenCalledWith({ to: '/login' });
    });
  });

  it('shows the avatar image in the Account nav item when one is set', async () => {
    mockGqlRequest.mockResolvedValue({ me: { avatarUrl: 'https://cdn.example.com/avatar.png' } });
    render(<AuthenticatedLayout />, { wrapper: Wrapper });

    await waitFor(() => {
      const images = screen.getAllByAltText('Your avatar');
      expect(
        images.some((img) => img.getAttribute('src') === 'https://cdn.example.com/avatar.png'),
      ).toBe(true);
    });
  });

  it('links to the Privacy Policy and Terms of Service from the sidebar', () => {
    render(<AuthenticatedLayout />, { wrapper: Wrapper });

    expect(
      screen
        .getAllByRole('link', { name: 'Privacy Policy' })
        .every((l) => l.getAttribute('href') === '/privacy'),
    ).toBe(true);
    expect(
      screen
        .getAllByRole('link', { name: 'Terms of Service' })
        .every((l) => l.getAttribute('href') === '/terms'),
    ).toBe(true);
  });

  it('links to Accessibility and Cookie preferences from the desktop sidebar footer', () => {
    render(<AuthenticatedLayout />, { wrapper: Wrapper });

    expect(screen.getByRole('link', { name: 'Accessibility' })).toHaveAttribute(
      'href',
      '/accessibility',
    );
    expect(screen.getByRole('button', { name: 'Cookie preferences' })).toBeInTheDocument();
  });

  it('shows all four legal links in the mobile sidebar drawer too', () => {
    render(<AuthenticatedLayout />, { wrapper: Wrapper });

    fireEvent.click(screen.getByRole('button', { name: /open menu/i }));

    // Now present in both the mobile drawer and the (CSS-hidden, but still
    // DOM-present) desktop sidebar, so two of each.
    expect(screen.getAllByRole('link', { name: 'Privacy Policy' })).toHaveLength(2);
    expect(screen.getAllByRole('link', { name: 'Terms of Service' })).toHaveLength(2);
    expect(screen.getAllByRole('button', { name: 'Cookie preferences' })).toHaveLength(2);
  });

  describe('assistant conversation subitems (JEF-229)', () => {
    const recent = {
      conversations: [
        {
          id: 'conv-1',
          title: 'Stripe prep',
          llmProvider: null,
          llmModel: null,
          createdAt: '',
          updatedAt: new Date().toISOString(),
        },
      ],
    };

    it('renders recent conversations under Assistant while in the section', async () => {
      mockPathname.mockReturnValue('/assistant');
      mockSearch.mockReturnValue({ conversation: 'conv-1' });
      mockGqlRequest.mockImplementation((query: string) => {
        if (query.includes('RecentConversations')) return Promise.resolve(recent);
        return Promise.resolve({ me: { avatarUrl: null } });
      });
      render(<AuthenticatedLayout />, { wrapper: Wrapper });

      await waitFor(() =>
        expect(screen.getAllByText('Stripe prep').length).toBeGreaterThanOrEqual(1),
      );
      // Both the desktop sidebar and the mobile drawer carry the subitems.
      const activeRows = screen
        .getAllByText('Stripe prep')
        .filter((el) => el.getAttribute('aria-current') === 'page');
      expect(activeRows.length).toBeGreaterThanOrEqual(1);
      // The bounded window, not the full history query.
      expect(mockGqlRequest).toHaveBeenCalledWith(expect.stringContaining('RecentConversations'), {
        limit: 10,
      });
    });

    it('does not render conversation subitems outside the assistant section', () => {
      mockGqlRequest.mockImplementation((query: string) => {
        if (query.includes('RecentConversations')) return Promise.resolve(recent);
        return Promise.resolve({ me: { avatarUrl: null } });
      });
      render(<AuthenticatedLayout />, { wrapper: Wrapper });

      expect(screen.queryByText('Stripe prep')).not.toBeInTheDocument();
      expect(screen.queryByText('All chats')).not.toBeInTheDocument();
    });
  });
});
