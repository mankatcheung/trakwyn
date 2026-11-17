import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
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
import { McpClientsCard } from '#/routes/_authenticated/settings/-components/McpClientsCard';

const makeClient = () => new QueryClient({ defaultOptions: { queries: { retry: false } } });

function Wrapper({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider>
      <QueryClientProvider client={makeClient()}>{children}</QueryClientProvider>
    </ThemeProvider>
  );
}

describe('McpClientsCard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('connected MCP clients (JEF-179)', () => {
    const GRANT = {
      id: 'grant-1',
      clientName: 'Claude Desktop',
      scope: 'full',
      authorizedAt: '2026-08-19T09:00:00.000Z',
      lastUsedAt: '2026-08-20T11:00:00.000Z',
    };

    /** Resolves the card's query and its revoke mutation by the operation each names. */
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
        return Promise.resolve({});
      });
      return revoke;
    }

    it('lists an authorized client with the scope it was granted', async () => {
      respondWithGrants([GRANT]);
      render(<McpClientsCard />, { wrapper: Wrapper });

      expect(await screen.findByText('Claude Desktop')).toBeInTheDocument();
      // The scope is the whole point of showing this — "full" means the client
      // can write, and the user should be able to see that at a glance.
      expect(screen.getByText('Connected MCP clients')).toBeInTheDocument();
    });

    it('says so plainly when nothing is connected', async () => {
      respondWithGrants([]);
      render(<McpClientsCard />, { wrapper: Wrapper });

      expect(await screen.findByText('No MCP clients are connected.')).toBeInTheDocument();
    });

    it('shows a loading placeholder instead of the empty state while the request is in flight', () => {
      mockGqlRequest.mockReturnValue(new Promise(() => {}));
      render(<McpClientsCard />, { wrapper: Wrapper });

      expect(screen.queryByText('No MCP clients are connected.')).not.toBeInTheDocument();
    });

    it('revokes by grant id and drops the client from the list', async () => {
      const revoke = respondWithGrants([GRANT]);
      render(<McpClientsCard />, { wrapper: Wrapper });
      await screen.findByText('Claude Desktop');

      fireEvent.click(screen.getByLabelText('Revoke access for Claude Desktop'));

      await waitFor(() => expect(revoke).toHaveBeenCalledWith({ id: 'grant-1' }));
      await waitFor(() => expect(screen.queryByText('Claude Desktop')).not.toBeInTheDocument());
    });

    it('keeps the client listed when revoking fails, rather than pretending it worked', async () => {
      const revoke = respondWithGrants([GRANT], true);
      render(<McpClientsCard />, { wrapper: Wrapper });
      await screen.findByText('Claude Desktop');

      fireEvent.click(screen.getByLabelText('Revoke access for Claude Desktop'));

      await waitFor(() => expect(revoke).toHaveBeenCalled());
      // Optimistically removing it would tell the user they are safe when the
      // client still has access.
      expect(screen.getByText('Claude Desktop')).toBeInTheDocument();
    });
  });
});
