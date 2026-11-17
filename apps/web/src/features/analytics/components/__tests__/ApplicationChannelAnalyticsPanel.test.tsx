import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const { mockGqlRequest } = vi.hoisted(() => ({
  mockGqlRequest: vi.fn(),
}));

vi.mock('#/graphql/client', () => ({
  gqlClient: { request: mockGqlRequest },
}));

import { ApplicationChannelAnalyticsPanel } from '#/features/analytics/components/ApplicationChannelAnalyticsPanel';

const makeClient = () => new QueryClient({ defaultOptions: { queries: { retry: false } } });

function Wrapper({ children }: { children: React.ReactNode }) {
  return <QueryClientProvider client={makeClient()}>{children}</QueryClientProvider>;
}

const stat = (overrides: Partial<Record<string, unknown>> = {}) => ({
  label: 'LinkedIn',
  applicationCount: 10,
  respondedCount: 5,
  responseRate: 50,
  offerCount: 2,
  offerRate: 20,
  ...overrides,
});

const analytics = (overrides: Partial<Record<string, unknown>> = {}) => ({
  bySource: [],
  byTag: [],
  ...overrides,
});

describe('ApplicationChannelAnalyticsPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('shows empty-state guidance for both sections when there is no data', async () => {
    mockGqlRequest.mockResolvedValue({ applicationChannelAnalytics: analytics() });
    render(<ApplicationChannelAnalyticsPanel />, { wrapper: Wrapper });

    await waitFor(() => {
      expect(screen.getByText(/add a source when logging an application/i)).toBeInTheDocument();
    });
    expect(screen.getByText(/add tags to your applications/i)).toBeInTheDocument();
  });

  it('renders source groups with application count, response rate, and offer rate', async () => {
    mockGqlRequest.mockResolvedValue({
      applicationChannelAnalytics: analytics({
        bySource: [
          stat({ label: 'LinkedIn', applicationCount: 10, responseRate: 50, offerRate: 20 }),
        ],
      }),
    });
    render(<ApplicationChannelAnalyticsPanel />, { wrapper: Wrapper });

    await waitFor(() => {
      expect(screen.getByText('LinkedIn')).toBeInTheDocument();
    });
    expect(screen.getByText('10 apps')).toBeInTheDocument();
    expect(screen.getByText('50%')).toBeInTheDocument();
    expect(screen.getByText('20%')).toBeInTheDocument();
  });

  it('renders tag groups independently of source groups', async () => {
    mockGqlRequest.mockResolvedValue({
      applicationChannelAnalytics: analytics({
        byTag: [stat({ label: 'remote', applicationCount: 4 })],
      }),
    });
    render(<ApplicationChannelAnalyticsPanel />, { wrapper: Wrapper });

    await waitFor(() => {
      expect(screen.getByText('remote')).toBeInTheDocument();
    });
    expect(screen.getByText('4 apps')).toBeInTheDocument();
  });

  it('flags a group with fewer than 3 applications as a small sample', async () => {
    mockGqlRequest.mockResolvedValue({
      applicationChannelAnalytics: analytics({
        bySource: [stat({ label: 'Referral', applicationCount: 2 })],
      }),
    });
    render(<ApplicationChannelAnalyticsPanel />, { wrapper: Wrapper });

    await waitFor(() => {
      expect(screen.getByText('small sample')).toBeInTheDocument();
    });
  });

  it('does not flag a group once application count clears the threshold', async () => {
    mockGqlRequest.mockResolvedValue({
      applicationChannelAnalytics: analytics({
        bySource: [stat({ label: 'Referral', applicationCount: 3 })],
      }),
    });
    render(<ApplicationChannelAnalyticsPanel />, { wrapper: Wrapper });

    await waitFor(() => {
      expect(screen.getByText('Referral')).toBeInTheDocument();
    });
    expect(screen.queryByText('small sample')).not.toBeInTheDocument();
  });

  it('shows the single-app label form when applicationCount is 1', async () => {
    mockGqlRequest.mockResolvedValue({
      applicationChannelAnalytics: analytics({
        bySource: [stat({ label: 'Cold email', applicationCount: 1 })],
      }),
    });
    render(<ApplicationChannelAnalyticsPanel />, { wrapper: Wrapper });

    await waitFor(() => {
      expect(screen.getByText('1 app')).toBeInTheDocument();
    });
  });

  it('renders nothing when the query fails', async () => {
    mockGqlRequest.mockRejectedValue(new Error('Network error'));
    const { container } = render(<ApplicationChannelAnalyticsPanel />, { wrapper: Wrapper });

    await waitFor(() => {
      expect(container).toBeEmptyDOMElement();
    });
  });
});
