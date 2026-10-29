import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const { mockGqlRequest } = vi.hoisted(() => ({
  mockGqlRequest: vi.fn(),
}));

vi.mock('#/graphql/client', () => ({
  gqlClient: { request: mockGqlRequest },
}));

import { ActivityTab } from '#/routes/_authenticated/applications/$applicationId/-components/ActivityTab';

const makeClient = () => new QueryClient({ defaultOptions: { queries: { retry: false } } });

function Wrapper({ children }: { children: React.ReactNode }) {
  return <QueryClientProvider client={makeClient()}>{children}</QueryClientProvider>;
}

describe('ActivityTab', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('shows a loading placeholder instead of the empty state while the request is in flight', () => {
    mockGqlRequest.mockReturnValue(new Promise(() => {}));
    render(<ActivityTab applicationId="app-1" />, { wrapper: Wrapper });

    expect(screen.queryByText('No activity yet.')).not.toBeInTheDocument();
  });

  it('shows an empty state when there is no activity', async () => {
    mockGqlRequest.mockResolvedValue({ activityLogs: [] });
    render(<ActivityTab applicationId="app-1" />, { wrapper: Wrapper });

    await waitFor(() => {
      expect(screen.getByText('No activity yet.')).toBeInTheDocument();
    });
  });

  it('renders a status_changed event with its from/to detail', async () => {
    mockGqlRequest.mockResolvedValue({
      activityLogs: [
        {
          id: 'log-1',
          eventType: 'status_changed',
          payload: JSON.stringify({ from: 'applied', to: 'interviewing' }),
          createdAt: '2024-01-01T00:00:00.000Z',
        },
      ],
    });
    render(<ActivityTab applicationId="app-1" />, { wrapper: Wrapper });

    await waitFor(() => {
      expect(screen.getByText('Status changed')).toBeInTheDocument();
    });
    expect(screen.getByText(/applied → interviewing/)).toBeInTheDocument();
  });

  it('falls back to the raw eventType label for an unrecognized event', async () => {
    mockGqlRequest.mockResolvedValue({
      activityLogs: [
        {
          id: 'log-2',
          eventType: 'something_new',
          payload: '{}',
          createdAt: '2024-01-01T00:00:00.000Z',
        },
      ],
    });
    render(<ActivityTab applicationId="app-1" />, { wrapper: Wrapper });

    await waitFor(() => {
      expect(screen.getByText('something_new')).toBeInTheDocument();
    });
  });

  it('labels a change an MCP client made with the token it used (JEF-466)', async () => {
    mockGqlRequest.mockResolvedValue({
      activityLogs: [
        {
          id: 'log-3',
          eventType: 'field_updated',
          payload: JSON.stringify({
            fields: ['role'],
            source: 'mcp',
            apiTokenId: 'tok-1',
            apiTokenName: 'Claude Desktop',
          }),
          createdAt: '2024-01-01T00:00:00.000Z',
        },
      ],
    });
    render(<ActivityTab applicationId="app-1" />, { wrapper: Wrapper });

    await waitFor(() => {
      expect(screen.getByText(/via Claude Desktop \(MCP\)/)).toBeInTheDocument();
    });
  });

  it('shows no attribution for a change made in the app', async () => {
    mockGqlRequest.mockResolvedValue({
      activityLogs: [
        {
          id: 'log-4',
          eventType: 'field_updated',
          payload: JSON.stringify({ fields: ['role'] }),
          createdAt: '2024-01-01T00:00:00.000Z',
        },
      ],
    });
    render(<ActivityTab applicationId="app-1" />, { wrapper: Wrapper });

    await waitFor(() => {
      expect(screen.getByText('Fields updated')).toBeInTheDocument();
    });
    expect(screen.queryByText(/\(MCP\)/)).not.toBeInTheDocument();
  });
});
