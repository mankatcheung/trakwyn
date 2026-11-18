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
import { ShareLinksCard } from '#/features/settings/components/integrations/ShareLinksCard';
import { mockGql, respond, respondError } from '#/__tests__/helpers/gqlMock';
import {
  CREATE_SHARE_LINK,
  SHARE_LINKS_QUERY,
} from '#/features/settings/graphql/integrationsQueries';

const makeClient = () => new QueryClient({ defaultOptions: { queries: { retry: false } } });

function Wrapper({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider>
      <QueryClientProvider client={makeClient()}>{children}</QueryClientProvider>
    </ThemeProvider>
  );
}

describe('ShareLinksCard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Pro features (JEF-344)', () => {
    const planRequired = (message: string) => ({
      response: { errors: [{ message, extensions: { code: 'PLAN_REQUIRED' } }] },
    });

    it('offers the plan page when creating a share link needs Pro', async () => {
      mockGql(mockGqlRequest, [
        respond(SHARE_LINKS_QUERY, { shareLinks: [] }),
        respondError(CREATE_SHARE_LINK, planRequired('Share links is a Pro feature')),
      ]);
      render(<ShareLinksCard />, { wrapper: Wrapper });

      fireEvent.change(await screen.findByPlaceholderText('e.g. For my mentor'), {
        target: { value: 'coach' },
      });
      fireEvent.click(screen.getByRole('button', { name: /create link/i }));

      expect(await screen.findByText(/Share links is a Pro feature/)).toBeInTheDocument();
      expect(screen.getByRole('link', { name: 'See what Pro includes' })).toBeInTheDocument();
    });

    it('shows other failures as a plain error, with no upgrade link', async () => {
      mockGql(mockGqlRequest, [
        respond(SHARE_LINKS_QUERY, { shareLinks: [] }),
        respondError(CREATE_SHARE_LINK, {
          response: { errors: [{ message: 'Nope', extensions: { code: 'VALIDATION' } }] },
        }),
      ]);
      render(<ShareLinksCard />, { wrapper: Wrapper });

      fireEvent.change(await screen.findByPlaceholderText('e.g. For my mentor'), {
        target: { value: 'coach' },
      });
      fireEvent.click(screen.getByRole('button', { name: /create link/i }));

      expect(await screen.findByText('Nope')).toBeInTheDocument();
      expect(screen.queryByRole('link', { name: 'See what Pro includes' })).not.toBeInTheDocument();
    });
  });

  describe('progressive disclosure of the create-share-link form (redesign)', () => {
    function respondByOperation(links: Array<Record<string, unknown>> = []) {
      mockGql(mockGqlRequest, [
        respond(SHARE_LINKS_QUERY, { shareLinks: links }),
        respond(CREATE_SHARE_LINK, {
          createShareLink: {
            id: 's1',
            name: 'n',
            token: 'share_secret',
            createdAt: '2026-01-01T00:00:00.000Z',
          },
        }),
      ]);
    }

    it('opens the create-link form automatically when no link exists yet', async () => {
      respondByOperation([]);
      render(<ShareLinksCard />, { wrapper: Wrapper });
      await waitFor(() => expect(mockGqlRequest).toHaveBeenCalled());

      expect(screen.getByPlaceholderText('e.g. For my mentor')).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'New link' })).not.toBeInTheDocument();
    });

    it('collapses the create-link form behind "New link" once a link exists, and expands it on click', async () => {
      respondByOperation([
        { id: 'a', name: 'existing link', lastUsedAt: null, createdAt: '2026-01-01T00:00:00.000Z' },
      ]);
      render(<ShareLinksCard />, { wrapper: Wrapper });
      await screen.findByText('existing link');

      expect(screen.queryByPlaceholderText('e.g. For my mentor')).not.toBeInTheDocument();
      fireEvent.click(screen.getByRole('button', { name: 'New link' }));

      expect(screen.getByPlaceholderText('e.g. For my mentor')).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'New link' })).not.toBeInTheDocument();
    });
  });
});
