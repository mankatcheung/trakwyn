import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const { mockGqlRequest } = vi.hoisted(() => ({
  mockGqlRequest: vi.fn(),
}));

vi.mock('#/graphql/client', () => ({
  gqlClient: { request: mockGqlRequest },
}));

import { InterviewRoundAnalyticsPanel } from '#/features/analytics/components/InterviewRoundAnalyticsPanel';

const makeClient = () => new QueryClient({ defaultOptions: { queries: { retry: false } } });

function Wrapper({ children }: { children: React.ReactNode }) {
  return <QueryClientProvider client={makeClient()}>{children}</QueryClientProvider>;
}

const analytics = (overrides: Partial<Record<string, unknown>> = {}) => ({
  byType: [],
  roundsToOffer: { average: null, median: null, sampleSize: 0 },
  roundsToRejection: { average: null, median: null, sampleSize: 0 },
  ...overrides,
});

describe('InterviewRoundAnalyticsPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('shows the empty-state guidance when there are no round types with data', async () => {
    mockGqlRequest.mockResolvedValue({ interviewRoundAnalytics: analytics() });
    render(<InterviewRoundAnalyticsPanel />, { wrapper: Wrapper });

    await waitFor(() => {
      expect(screen.getByText(/log outcomes on your interview rounds/i)).toBeInTheDocument();
    });
  });

  it('renders each round type with its pass rate', async () => {
    mockGqlRequest.mockResolvedValue({
      interviewRoundAnalytics: analytics({
        byType: [
          { type: 'phone', passed: 6, failed: 2, pending: 1, cancelled: 0 },
          { type: 'technical', passed: 1, failed: 3, pending: 0, cancelled: 0 },
        ],
      }),
    });
    render(<InterviewRoundAnalyticsPanel />, { wrapper: Wrapper });

    await waitFor(() => {
      expect(screen.getByText('Phone')).toBeInTheDocument();
    });
    expect(screen.getByText('6/8 passed')).toBeInTheDocument();
    expect(screen.getByText('75%')).toBeInTheDocument();
    expect(screen.getByText('Technical')).toBeInTheDocument();
    expect(screen.getByText('1/4 passed')).toBeInTheDocument();
    expect(screen.getByText('25%')).toBeInTheDocument();
  });

  it('flags a round type with fewer than 3 decided rounds as a small sample', async () => {
    mockGqlRequest.mockResolvedValue({
      interviewRoundAnalytics: analytics({
        byType: [{ type: 'hr', passed: 1, failed: 1, pending: 0, cancelled: 0 }],
      }),
    });
    render(<InterviewRoundAnalyticsPanel />, { wrapper: Wrapper });

    await waitFor(() => {
      expect(screen.getByText('small sample')).toBeInTheDocument();
    });
  });

  it('does not flag a round type once decided rounds clear the threshold', async () => {
    mockGqlRequest.mockResolvedValue({
      interviewRoundAnalytics: analytics({
        byType: [{ type: 'hr', passed: 2, failed: 1, pending: 0, cancelled: 0 }],
      }),
    });
    render(<InterviewRoundAnalyticsPanel />, { wrapper: Wrapper });

    await waitFor(() => {
      expect(screen.getByText('HR')).toBeInTheDocument();
    });
    expect(screen.queryByText('small sample')).not.toBeInTheDocument();
  });

  it('shows the median rounds-to-offer and rounds-to-rejection with sample sizes', async () => {
    mockGqlRequest.mockResolvedValue({
      interviewRoundAnalytics: analytics({
        roundsToOffer: { average: 3, median: 3, sampleSize: 2 },
        roundsToRejection: { average: 1.5, median: 1.5, sampleSize: 4 },
      }),
    });
    render(<InterviewRoundAnalyticsPanel />, { wrapper: Wrapper });

    await waitFor(() => {
      expect(screen.getByText('2 offers')).toBeInTheDocument();
    });
    expect(screen.getByText('4 rejections')).toBeInTheDocument();
  });

  it('shows a "no data yet" fallback when there are no offers or rejections', async () => {
    mockGqlRequest.mockResolvedValue({ interviewRoundAnalytics: analytics() });
    render(<InterviewRoundAnalyticsPanel />, { wrapper: Wrapper });

    await waitFor(() => {
      expect(screen.getByText('No offers yet')).toBeInTheDocument();
    });
    expect(screen.getByText('No rejections yet')).toBeInTheDocument();
  });

  it('renders nothing when the query fails', async () => {
    mockGqlRequest.mockRejectedValue(new Error('Network error'));
    const { container } = render(<InterviewRoundAnalyticsPanel />, { wrapper: Wrapper });

    await waitFor(() => {
      expect(container).toBeEmptyDOMElement();
    });
  });
});
