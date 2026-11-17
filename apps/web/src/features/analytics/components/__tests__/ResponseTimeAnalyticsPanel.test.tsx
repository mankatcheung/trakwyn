import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const { mockGqlRequest } = vi.hoisted(() => ({
  mockGqlRequest: vi.fn(),
}));

vi.mock('#/graphql/client', () => ({
  gqlClient: { request: mockGqlRequest },
}));

import { ResponseTimeAnalyticsPanel } from '#/features/analytics/components/ResponseTimeAnalyticsPanel';

const makeClient = () => new QueryClient({ defaultOptions: { queries: { retry: false } } });

function Wrapper({ children }: { children: React.ReactNode }) {
  return <QueryClientProvider client={makeClient()}>{children}</QueryClientProvider>;
}

const analytics = (overrides: Partial<Record<string, unknown>> = {}) => ({
  timeInStage: [],
  timeToFirstResponse: { averageDays: null, medianDays: null, sampleSize: 0 },
  ...overrides,
});

describe('ResponseTimeAnalyticsPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('shows the empty-state guidance when there is no time-in-stage data', async () => {
    mockGqlRequest.mockResolvedValue({ responseTimeAnalytics: analytics() });
    render(<ResponseTimeAnalyticsPanel />, { wrapper: Wrapper });

    await waitFor(() => {
      expect(screen.getByText(/once applications move between stages/i)).toBeInTheDocument();
    });
  });

  it('shows "No responses yet" when time-to-first-response has no sample', async () => {
    mockGqlRequest.mockResolvedValue({ responseTimeAnalytics: analytics() });
    render(<ResponseTimeAnalyticsPanel />, { wrapper: Wrapper });

    await waitFor(() => {
      expect(screen.getByText('No responses yet')).toBeInTheDocument();
    });
  });

  it('renders each stage with its median duration', async () => {
    mockGqlRequest.mockResolvedValue({
      responseTimeAnalytics: analytics({
        timeInStage: [
          { status: 'draft', averageDays: 2, medianDays: 2, sampleSize: 5 },
          { status: 'applied', averageDays: 5.5, medianDays: 5.5, sampleSize: 4 },
        ],
      }),
    });
    render(<ResponseTimeAnalyticsPanel />, { wrapper: Wrapper });

    await waitFor(() => {
      expect(screen.getByText('Draft')).toBeInTheDocument();
    });
    expect(screen.getByText('2.0d')).toBeInTheDocument();
    expect(screen.getByText('Applied')).toBeInTheDocument();
    expect(screen.getByText('5.5d')).toBeInTheDocument();
  });

  it('flags a stage with fewer than 3 samples as a small sample', async () => {
    mockGqlRequest.mockResolvedValue({
      responseTimeAnalytics: analytics({
        timeInStage: [{ status: 'rejected', averageDays: 1, medianDays: 1, sampleSize: 2 }],
      }),
    });
    render(<ResponseTimeAnalyticsPanel />, { wrapper: Wrapper });

    await waitFor(() => {
      expect(screen.getByText('small sample')).toBeInTheDocument();
    });
  });

  it('does not flag a stage once sample size clears the threshold', async () => {
    mockGqlRequest.mockResolvedValue({
      responseTimeAnalytics: analytics({
        timeInStage: [{ status: 'rejected', averageDays: 1, medianDays: 1, sampleSize: 3 }],
      }),
    });
    render(<ResponseTimeAnalyticsPanel />, { wrapper: Wrapper });

    await waitFor(() => {
      expect(screen.getByText('Rejected')).toBeInTheDocument();
    });
    expect(screen.queryByText('small sample')).not.toBeInTheDocument();
  });

  it('shows the median time-to-first-response with its sample size', async () => {
    mockGqlRequest.mockResolvedValue({
      responseTimeAnalytics: analytics({
        timeToFirstResponse: { averageDays: 4, medianDays: 4, sampleSize: 6 },
      }),
    });
    render(<ResponseTimeAnalyticsPanel />, { wrapper: Wrapper });

    await waitFor(() => {
      expect(screen.getByText('6 applications')).toBeInTheDocument();
    });
    expect(screen.getByText('4.0d')).toBeInTheDocument();
  });

  it('renders nothing when the query fails', async () => {
    mockGqlRequest.mockRejectedValue(new Error('Network error'));
    const { container } = render(<ResponseTimeAnalyticsPanel />, { wrapper: Wrapper });

    await waitFor(() => {
      expect(container).toBeEmptyDOMElement();
    });
  });
});
