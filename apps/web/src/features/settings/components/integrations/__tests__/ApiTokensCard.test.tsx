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
import { ApiTokensCard } from '#/features/settings/components/integrations/ApiTokensCard';

const makeClient = () => new QueryClient({ defaultOptions: { queries: { retry: false } } });

function Wrapper({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider>
      <QueryClientProvider client={makeClient()}>{children}</QueryClientProvider>
    </ThemeProvider>
  );
}

describe('ApiTokensCard', () => {
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

  describe('the Free plan note on API tokens (JEF-442)', () => {
    const NOTE = /On the Free plan a token works with MCP only/;

    const serveBilling = (enforced: boolean, apiAccess: boolean) =>
      mockGqlRequest.mockImplementation((doc: string) =>
        Promise.resolve(
          typeof doc === 'string' && doc.includes('query BillingStatus')
            ? { billingStatus: { enforced, features: { apiAccess, mcpAccess: true } } }
            : { apiTokens: [] },
        ),
      );

    it('tells a Free user their token is for MCP', async () => {
      serveBilling(true, false);
      render(<ApiTokensCard />, { wrapper: Wrapper });

      expect(await screen.findByText(NOTE)).toBeInTheDocument();
    });

    it('stays quiet for a Pro user', async () => {
      serveBilling(true, true);
      render(<ApiTokensCard />, { wrapper: Wrapper });

      await screen.findByText('API tokens');
      await waitFor(() => expect(mockGqlRequest).toHaveBeenCalled());
      expect(screen.queryByText(NOTE)).toBeNull();
    });

    it('stays quiet where plans are not enforced', async () => {
      serveBilling(false, false);
      render(<ApiTokensCard />, { wrapper: Wrapper });

      await screen.findByText('API tokens');
      await waitFor(() => expect(mockGqlRequest).toHaveBeenCalled());
      expect(screen.queryByText(NOTE)).toBeNull();
    });
  });

  describe('API token scope (JEF-170)', () => {
    /** The card issues several queries; resolve each by the operation it names. */
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
      render(<ApiTokensCard />, { wrapper: Wrapper });

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
      render(<ApiTokensCard />, { wrapper: Wrapper });

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
      render(<ApiTokensCard />, { wrapper: Wrapper });

      expect(await screen.findByText('old token')).toBeInTheDocument();
      expect(screen.getByText('mcp token')).toBeInTheDocument();
      expect(screen.getAllByText('Full access').length).toBeGreaterThan(0);
      expect(screen.getAllByText('Read-only').length).toBeGreaterThan(0);
    });
  });

  describe('progressive disclosure of the create-token form (redesign)', () => {
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

    it('opens the create-token form automatically when no token exists yet', async () => {
      respondByOperation([]);
      render(<ApiTokensCard />, { wrapper: Wrapper });
      await waitFor(() => expect(mockGqlRequest).toHaveBeenCalled());

      expect(screen.getByPlaceholderText('e.g. CI pipeline')).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'New token' })).not.toBeInTheDocument();
    });

    it('collapses the create-token form behind "New token" once a token exists, and expands it on click', async () => {
      respondByOperation([
        {
          id: 'a',
          name: 'existing',
          scope: 'read',
          lastUsedAt: null,
          createdAt: '2026-01-01T00:00:00.000Z',
        },
      ]);
      render(<ApiTokensCard />, { wrapper: Wrapper });
      await screen.findByText('existing');

      expect(screen.queryByPlaceholderText('e.g. CI pipeline')).not.toBeInTheDocument();
      const newTokenButton = screen.getByRole('button', { name: 'New token' });

      fireEvent.click(newTokenButton);

      expect(screen.getByPlaceholderText('e.g. CI pipeline')).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'New token' })).not.toBeInTheDocument();
    });

    it('collapses the create-token form again via Cancel, discarding what was typed', async () => {
      respondByOperation([
        {
          id: 'a',
          name: 'existing',
          scope: 'read',
          lastUsedAt: null,
          createdAt: '2026-01-01T00:00:00.000Z',
        },
      ]);
      render(<ApiTokensCard />, { wrapper: Wrapper });
      await screen.findByText('existing');

      fireEvent.click(screen.getByRole('button', { name: 'New token' }));
      fireEvent.change(screen.getByPlaceholderText('e.g. CI pipeline'), {
        target: { value: 'discard me' },
      });
      fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));

      expect(screen.queryByPlaceholderText('e.g. CI pipeline')).not.toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'New token' })).toBeInTheDocument();

      fireEvent.click(screen.getByRole('button', { name: 'New token' }));
      expect(screen.getByPlaceholderText('e.g. CI pipeline')).toHaveValue('');
    });

    it('collapses the create-token form again after a successful create', async () => {
      let created = false;
      mockGqlRequest.mockImplementation((doc: string) => {
        if (typeof doc === 'string' && doc.includes('query ApiTokens')) {
          return Promise.resolve({
            apiTokens: created
              ? [
                  {
                    id: 't1',
                    name: 'n',
                    scope: 'read',
                    lastUsedAt: null,
                    createdAt: '2026-01-01T00:00:00.000Z',
                  },
                ]
              : [],
          });
        }
        if (typeof doc === 'string' && doc.includes('mutation CreateApiToken')) {
          created = true;
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
        return Promise.resolve({});
      });
      render(<ApiTokensCard />, { wrapper: Wrapper });
      await waitFor(() =>
        expect(screen.getByPlaceholderText('e.g. CI pipeline')).toBeInTheDocument(),
      );

      fireEvent.change(screen.getByPlaceholderText('e.g. CI pipeline'), {
        target: { value: 'my token' },
      });
      fireEvent.click(screen.getByRole('button', { name: /create token/i }));
      await waitFor(() => expect(screen.getByText('trakwyn_secret')).toBeInTheDocument());
      fireEvent.click(screen.getByRole('button', { name: 'Done' }));

      await waitFor(() => {
        expect(screen.getByRole('button', { name: 'New token' })).toBeInTheDocument();
      });
    });
  });

  describe('Pro features (JEF-344)', () => {
    it('never asks a Free user to upgrade to create an API token (JEF-442)', async () => {
      mockGqlRequest.mockImplementation((doc: string) => {
        if (typeof doc === 'string' && doc.includes('mutation CreateApiToken')) {
          return Promise.reject({
            response: { errors: [{ message: 'Nope', extensions: { code: 'VALIDATION' } }] },
          });
        }
        return Promise.resolve({ apiTokens: [] });
      });
      render(<ApiTokensCard />, { wrapper: Wrapper });

      fireEvent.change(await screen.findByPlaceholderText('e.g. CI pipeline'), {
        target: { value: 'ci' },
      });
      fireEvent.click(screen.getByRole('button', { name: /create token/i }));

      expect(await screen.findByText('Nope')).toBeInTheDocument();
      expect(screen.queryByRole('link', { name: 'See what Pro includes' })).not.toBeInTheDocument();
    });
  });
});
