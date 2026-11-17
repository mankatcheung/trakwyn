import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';

const { mockGqlRequest } = vi.hoisted(() => ({
  mockGqlRequest: vi.fn(),
}));

vi.mock('@tanstack/react-router', () => ({
  createFileRoute: () => (opts: object) => ({ ...opts, useSearch: () => ({}) }),
  useNavigate: () => vi.fn(),
  redirect: vi.fn(),
  Link: ({ children, to }: { children: ReactNode; to: string }) => <a href={to}>{children}</a>,
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
  put: vi.fn(),
}));

import { ThemeProvider } from '#/lib/theme';
import { SettingsIntegrationsPage } from '#/features/settings/pages/SettingsIntegrationsPage';

const makeClient = () => new QueryClient({ defaultOptions: { queries: { retry: false } } });

function Wrapper({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider>
      <QueryClientProvider client={makeClient()}>{children}</QueryClientProvider>
    </ThemeProvider>
  );
}

// The cards are tested on their own: ApiTokensCard, McpClientsCard and ShareLinksCard.
describe('SettingsIntegrationsPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGqlRequest.mockResolvedValue({
      me: {
        id: 'user-1',
        email: 'test@example.com',
        name: null,
        timezone: null,
        targetRole: null,
        avatarUrl: null,
      },
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('renders the integrations page', async () => {
    render(<SettingsIntegrationsPage />, { wrapper: Wrapper });
    await waitFor(() => {
      expect(mockGqlRequest).toHaveBeenCalled();
    });
  });

  it('points to the setup guide for connecting an MCP client (JEF-231)', () => {
    render(<SettingsIntegrationsPage />, { wrapper: Wrapper });

    expect(screen.getByRole('link', { name: 'Read the guide' })).toHaveAttribute(
      'href',
      '/ai-mcp-setup',
    );
  });

  it('shows the API tokens, connected MCP clients and share links cards', async () => {
    mockGqlRequest.mockResolvedValue({ apiTokens: [], mcpOAuthGrants: [], shareLinks: [] });
    render(<SettingsIntegrationsPage />, { wrapper: Wrapper });

    expect(await screen.findByText('API tokens')).toBeInTheDocument();
    expect(screen.getByText('Connected MCP clients')).toBeInTheDocument();
    expect(screen.getByText('Share links')).toBeInTheDocument();
  });
});
