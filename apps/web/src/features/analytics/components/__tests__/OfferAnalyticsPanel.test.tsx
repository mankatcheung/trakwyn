import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const { mockGqlRequest } = vi.hoisted(() => ({
  mockGqlRequest: vi.fn(),
}));

vi.mock('#/graphql/client', () => ({
  gqlClient: { request: mockGqlRequest },
}));

import { OfferAnalyticsPanel } from '#/features/analytics/components/OfferAnalyticsPanel';

const makeClient = () => new QueryClient({ defaultOptions: { queries: { retry: false } } });

function Wrapper({ children }: { children: React.ReactNode }) {
  return <QueryClientProvider client={makeClient()}>{children}</QueryClientProvider>;
}

const trendPoint = (overrides: Partial<Record<string, unknown>> = {}) => ({
  offerId: 'offer-1',
  applicationId: 'app-1',
  company: 'Acme',
  role: 'Engineer',
  createdAt: '2024-01-15T00:00:00.000Z',
  currency: 'USD',
  normalizedYearlySalary: 130000,
  ...overrides,
});

const currencyStat = (overrides: Partial<Record<string, unknown>> = {}) => ({
  currency: 'USD',
  count: 2,
  minYearlySalary: 110000,
  maxYearlySalary: 150000,
  medianYearlySalary: 130000,
  averageYearlySalary: 130000,
  ...overrides,
});

const analytics = (overrides: Partial<Record<string, unknown>> = {}) => ({
  trend: [],
  byCurrency: [],
  ...overrides,
});

describe('OfferAnalyticsPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('shows the empty-state guidance when there are no offers', async () => {
    mockGqlRequest.mockResolvedValue({ offerAnalytics: analytics() });
    render(<OfferAnalyticsPanel />, { wrapper: Wrapper });

    await waitFor(() => {
      expect(screen.getByText(/log an offer on an application/i)).toBeInTheDocument();
    });
  });

  it('renders currency summary stats and trend entries', async () => {
    mockGqlRequest.mockResolvedValue({
      offerAnalytics: analytics({
        byCurrency: [currencyStat({ medianYearlySalary: 130000 })],
        trend: [trendPoint({ normalizedYearlySalary: 145000 })],
      }),
    });
    render(<OfferAnalyticsPanel />, { wrapper: Wrapper });

    await waitFor(() => {
      expect(screen.getByText('USD median (2)')).toBeInTheDocument();
    });
    expect(screen.getByText('$130,000')).toBeInTheDocument();
    expect(screen.getByText('$145,000')).toBeInTheDocument();
    expect(screen.getByText('Acme')).toBeInTheDocument();
    expect(screen.getByText(/Engineer/)).toBeInTheDocument();
  });

  it('keeps currencies separate rather than mixing them into one stat', async () => {
    mockGqlRequest.mockResolvedValue({
      offerAnalytics: analytics({
        byCurrency: [
          currencyStat({ currency: 'USD', count: 2 }),
          currencyStat({ currency: 'GBP', count: 1, medianYearlySalary: 80000 }),
        ],
      }),
    });
    render(<OfferAnalyticsPanel />, { wrapper: Wrapper });

    await waitFor(() => {
      expect(screen.getByText('USD median (2)')).toBeInTheDocument();
    });
    expect(screen.getByText('GBP median (1)')).toBeInTheDocument();
  });

  it('renders nothing when the query fails', async () => {
    mockGqlRequest.mockRejectedValue(new Error('Network error'));
    const { container } = render(<OfferAnalyticsPanel />, { wrapper: Wrapper });

    await waitFor(() => {
      expect(container).toBeEmptyDOMElement();
    });
  });
});
