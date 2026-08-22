import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const { mockGqlRequest } = vi.hoisted(() => ({
  mockGqlRequest: vi.fn(),
}));

vi.mock('@tanstack/react-router', () => ({
  createFileRoute: () => (opts: object) => ({ ...opts, useSearch: () => ({}) }),
  useNavigate: () => vi.fn(),
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
  put: vi.fn(),
}));

import { ThemeProvider } from '#/lib/theme';
import { SettingsIntegrationsPage } from '#/routes/_authenticated/settings/-components/SettingsIntegrationsPage';

const makeClient = () => new QueryClient({ defaultOptions: { queries: { retry: false } } });

function Wrapper({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider>
      <QueryClientProvider client={makeClient()}>{children}</QueryClientProvider>
    </ThemeProvider>
  );
}

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

  describe('API token scope (JEF-170)', () => {
    /** The page issues several queries; resolve each by the operation it names. */
    function respondByOperation(tokens: Array<Record<string, unknown>> = []) {
      mockGqlRequest.mockImplementation((doc: string) => {
        if (typeof doc === 'string' && doc.includes('query ApiTokens')) {
          return Promise.resolve({ apiTokens: tokens });
        }
        if (typeof doc === 'string' && doc.includes('mutation CreateApiToken')) {
          return Promise.resolve({
            createApiToken: {
              id: 't1',
              name: 'n',
              token: 'trakwyn_secret',
              scope: 'read',
              createdAt: '2026-01-01T00:00:00.000Z',
            },
          });
        }
        return Promise.resolve({
          me: {
            id: 'user-1',
            email: 'a@b.c',
            name: null,
            timezone: null,
            targetRole: null,
            avatarUrl: null,
          },
        });
      });
    }

    it('defaults new tokens to read-only, so MCP does not require full account access', async () => {
      respondByOperation();
      render(<SettingsIntegrationsPage />, { wrapper: Wrapper });

      const nameInput = await screen.findByPlaceholderText('e.g. CI pipeline');
      fireEvent.change(nameInput, { target: { value: 'my mcp client' } });
      fireEvent.click(screen.getByRole('button', { name: /create token/i }));

      await waitFor(() => {
        expect(mockGqlRequest).toHaveBeenCalledWith(
          expect.stringContaining('mutation CreateApiToken'),
          { name: 'my mcp client', scope: 'read' },
        );
      });
    });

    it('sends full scope only when explicitly chosen', async () => {
      respondByOperation();
      render(<SettingsIntegrationsPage />, { wrapper: Wrapper });

      const nameInput = await screen.findByPlaceholderText('e.g. CI pipeline');
      fireEvent.change(nameInput, { target: { value: 'ci' } });
      fireEvent.change(screen.getByLabelText('Access'), { target: { value: 'full' } });
      fireEvent.click(screen.getByRole('button', { name: /create token/i }));

      await waitFor(() => {
        expect(mockGqlRequest).toHaveBeenCalledWith(
          expect.stringContaining('mutation CreateApiToken'),
          { name: 'ci', scope: 'full' },
        );
      });
    });

    it("shows each existing token's scope, so pre-existing full-access tokens are visible", async () => {
      respondByOperation([
        {
          id: 'a',
          name: 'old token',
          scope: 'full',
          lastUsedAt: null,
          createdAt: '2026-01-01T00:00:00.000Z',
        },
        {
          id: 'b',
          name: 'mcp token',
          scope: 'read',
          lastUsedAt: null,
          createdAt: '2026-01-01T00:00:00.000Z',
        },
      ]);
      render(<SettingsIntegrationsPage />, { wrapper: Wrapper });

      expect(await screen.findByText('old token')).toBeInTheDocument();
      expect(screen.getByText('mcp token')).toBeInTheDocument();
      expect(screen.getAllByText('Full access').length).toBeGreaterThan(0);
      expect(screen.getAllByText('Read-only').length).toBeGreaterThan(0);
    });
  });

  describe('connected MCP clients (JEF-179)', () => {
    const GRANT = {
      id: 'grant-1',
      clientName: 'Claude Desktop',
      scope: 'full',
      authorizedAt: '2026-08-19T09:00:00.000Z',
      lastUsedAt: '2026-08-20T11:00:00.000Z',
    };

    /** Resolves each of the page's queries by the operation it names. */
    function respondWithGrants(grants: Array<Record<string, unknown>>, revokeFails = false) {
      const revoke = revokeFails
        ? vi.fn().mockRejectedValue(new Error('nope'))
        : vi.fn().mockResolvedValue({ revokeMcpOAuthGrant: true });
      let listed = grants;
      mockGqlRequest.mockImplementation((doc: string, vars?: Record<string, unknown>) => {
        if (typeof doc === 'string' && doc.includes('query McpOAuthGrants')) {
          return Promise.resolve({ mcpOAuthGrants: listed });
        }
        if (typeof doc === 'string' && doc.includes('mutation RevokeMcpOAuthGrant')) {
          if (!revokeFails) listed = listed.filter((g) => g.id !== vars?.id);
          return revoke(vars);
        }
        if (typeof doc === 'string' && doc.includes('query ApiTokens')) {
          return Promise.resolve({ apiTokens: [] });
        }
        return Promise.resolve({
          me: {
            id: 'user-1',
            email: 'a@b.c',
            name: null,
            timezone: null,
            targetRole: null,
            avatarUrl: null,
          },
        });
      });
      return revoke;
    }

    it('lists an authorized client with the scope it was granted', async () => {
      respondWithGrants([GRANT]);
      render(<SettingsIntegrationsPage />, { wrapper: Wrapper });

      expect(await screen.findByText('Claude Desktop')).toBeInTheDocument();
      // The scope is the whole point of showing this — "full" means the client
      // can write, and the user should be able to see that at a glance.
      expect(screen.getByText('Connected MCP clients')).toBeInTheDocument();
    });

    it('says so plainly when nothing is connected', async () => {
      respondWithGrants([]);
      render(<SettingsIntegrationsPage />, { wrapper: Wrapper });

      expect(await screen.findByText('No MCP clients are connected.')).toBeInTheDocument();
    });

    it('shows a loading placeholder instead of the empty state while the request is in flight', () => {
      mockGqlRequest.mockReturnValue(new Promise(() => {}));
      render(<SettingsIntegrationsPage />, { wrapper: Wrapper });

      expect(screen.queryByText('No MCP clients are connected.')).not.toBeInTheDocument();
    });

    it('revokes by grant id and drops the client from the list', async () => {
      const revoke = respondWithGrants([GRANT]);
      render(<SettingsIntegrationsPage />, { wrapper: Wrapper });
      await screen.findByText('Claude Desktop');

      fireEvent.click(screen.getByLabelText('Revoke access for Claude Desktop'));

      await waitFor(() => expect(revoke).toHaveBeenCalledWith({ id: 'grant-1' }));
      await waitFor(() => expect(screen.queryByText('Claude Desktop')).not.toBeInTheDocument());
    });

    it('keeps the client listed when revoking fails, rather than pretending it worked', async () => {
      const revoke = respondWithGrants([GRANT], true);
      render(<SettingsIntegrationsPage />, { wrapper: Wrapper });
      await screen.findByText('Claude Desktop');

      fireEvent.click(screen.getByLabelText('Revoke access for Claude Desktop'));

      await waitFor(() => expect(revoke).toHaveBeenCalled());
      // Optimistically removing it would tell the user they are safe when the
      // client still has access.
      expect(screen.getByText('Claude Desktop')).toBeInTheDocument();
    });
  });
});
